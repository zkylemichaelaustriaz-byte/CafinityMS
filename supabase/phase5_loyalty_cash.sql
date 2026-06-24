-- ============================================================================
-- Phase 5 — Pending loyalty points, pay-before-preparing cash rule,
--           completion award, and customer self-cancellation.
-- Run AFTER schema.sql / phase2.sql / phase3_hardening.sql (and phase4_favorites).
-- Idempotent: safe to run more than once.
--
-- POINT-AWARD STATE DIAGRAM
--   place_order        -> orders.points_state = 'pending'  (NOT credited yet)
--   advance->completed -> 'earned'   (users.loyalty_points += points_earned, 'earn' ledger row)
--   cancel (either)    -> 'reversed' (only debits the balance if it was already 'earned')
--
-- CASH RULE (chosen): PAY BEFORE PREPARING.
--   A Cash order cannot leave 'pending' until payment_status = 'paid'.
--   GCash is paid at checkout, so it is unaffected.
-- ============================================================================

-- 1. Order-level point lifecycle marker -------------------------------------
alter table public.orders
  add column if not exists points_state text not null default 'pending';

do $$ begin
  alter table public.orders
    add constraint orders_points_state_chk
    check (points_state in ('pending', 'earned', 'reversed'));
exception when duplicate_object then null; end $$;

-- Backfill existing rows: under the OLD model points were credited at placement,
-- so treat every pre-existing non-cancelled order as already 'earned' (prevents
-- any double-credit if it later completes); cancelled orders are 'reversed'.
update public.orders
  set points_state = case when status = 'cancelled' then 'reversed' else 'earned' end
  where points_state = 'pending'
    and created_at < now() - interval '1 second';

-- ----------------------------------------------------------------------------
-- 2. place_order — identical to phase 3 EXCEPT points are now PENDING:
--    the user's balance is NOT credited here and no 'earn'/'bonus' ledger rows
--    are written until the order is completed. Streak still advances on placing.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_branch_id           uuid,
  p_payment_method      text,
  p_promo_code          text,
  p_notes               text,
  p_items               jsonb,
  p_checkout_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_existing    public.orders%rowtype;
  v_branch      public.branches%rowtype;
  v_order       public.orders%rowtype;
  v_item        jsonb;
  v_cust        jsonb;
  v_variant     public.product_variants%rowtype;
  v_product     public.products%rowtype;
  v_inv         public.branch_inventory%rowtype;
  v_qty         int;
  v_total_qty   int := 0;
  v_line_unit   numeric(10,2);
  v_line_sub    numeric(10,2);
  v_subtotal    numeric(10,2) := 0;
  v_discount    numeric(10,2) := 0;
  v_total       numeric(10,2) := 0;
  v_promo       public.promotions%rowtype;
  v_redemption  record;
  v_order_item  public.order_items%rowtype;
  v_opt         public.customization_options%rowtype;
  v_grp         public.customization_groups%rowtype;
  v_points      int := 0;
  v_streak      int := 1;
  v_last_date   date;
  v_is_new_day  boolean;
  v_pay         text;
  v_notes       text;
  v_item_notes  text;
  v_single_seen uuid[];
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  if p_checkout_request_id is not null then
    select * into v_existing from public.orders
      where checkout_request_id = p_checkout_request_id and user_id = v_user;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'order_number', v_existing.order_number,
        'subtotal', v_existing.subtotal, 'discount_amount', v_existing.discount_amount,
        'total_amount', v_existing.total_amount, 'points_earned', v_existing.points_earned,
        'current_streak', (select current_streak from public.users where id = v_user),
        'idempotent', true);
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  v_pay := coalesce(p_payment_method, 'GCash');
  if v_pay not in ('GCash', 'Cash') then raise exception 'Invalid payment method'; end if;

  v_notes := coalesce(p_notes, '');
  if length(v_notes) > 500 then raise exception 'Order notes are too long'; end if;

  select * into v_branch from public.branches
    where id = p_branch_id and is_active = true;
  if not found then raise exception 'Branch is not available'; end if;

  begin
    insert into public.orders (user_id, branch_id, payment_method, notes, status,
                               payment_status, checkout_request_id)
    values (v_user, p_branch_id, v_pay, v_notes, 'pending', 'pending', p_checkout_request_id)
    returning * into v_order;
  exception when unique_violation then
    if p_checkout_request_id is not null then
      select * into v_existing from public.orders
        where checkout_request_id = p_checkout_request_id and user_id = v_user;
      if found then
        return jsonb_build_object(
          'order_id', v_existing.id, 'order_number', v_existing.order_number,
          'subtotal', v_existing.subtotal, 'discount_amount', v_existing.discount_amount,
          'total_amount', v_existing.total_amount, 'points_earned', v_existing.points_earned,
          'current_streak', (select current_streak from public.users where id = v_user),
          'idempotent', true);
      end if;
    end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 20 then
      raise exception 'Quantity for each item must be between 1 and 20';
    end if;
    v_total_qty := v_total_qty + v_qty;
    if v_total_qty > 50 then raise exception 'Order exceeds the maximum item count'; end if;

    select * into v_variant from public.product_variants
      where id = (v_item->>'product_variant_id')::uuid
        and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected item is no longer available'; end if;

    select * into v_product from public.products
      where id = v_variant.product_id and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected product is no longer available'; end if;

    select * into v_inv from public.branch_inventory
      where branch_id = p_branch_id and product_variant_id = v_variant.id
      for update;
    if not found then
      raise exception '% is not available at this branch', v_product.name;
    end if;
    if v_inv.is_available = false or v_inv.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;
    update public.branch_inventory
      set stock_quantity = stock_quantity - v_qty,
          is_available = (stock_quantity - v_qty) > 0,
          updated_at = now()
      where id = v_inv.id;

    v_line_unit  := v_variant.price;
    v_item_notes := left(coalesce(v_item->>'item_notes', ''), 200);

    insert into public.order_items (order_id, product_variant_id, product_name,
                                    variant_name, quantity, unit_price, subtotal, item_notes)
    values (v_order.id, v_variant.id, v_product.name, v_variant.name,
            v_qty, v_line_unit, 0, v_item_notes)
    returning * into v_order_item;

    v_single_seen := '{}';
    if v_item ? 'customizations' then
      for v_cust in select * from jsonb_array_elements(v_item->'customizations')
      loop
        select * into v_opt from public.customization_options
          where id = (v_cust->>'customization_option_id')::uuid;
        if not found then raise exception 'Invalid customization option'; end if;

        if not exists (
          select 1 from public.product_customization_link l
          where l.product_id = v_product.id and l.group_id = v_opt.group_id
        ) then
          raise exception 'Customization is not allowed for %', v_product.name;
        end if;

        select * into v_grp from public.customization_groups where id = v_opt.group_id;
        if v_grp.selection_type = 'single' then
          if v_opt.group_id = any (v_single_seen) then
            raise exception 'Only one option allowed for %', v_grp.name;
          end if;
          v_single_seen := array_append(v_single_seen, v_opt.group_id);
        end if;

        insert into public.order_item_customization
          (order_item_id, customization_option_id, option_name, quantity, additional_price)
        values (v_order_item.id, v_opt.id, v_opt.name, 1, v_opt.additional_price);
        v_line_unit := v_line_unit + v_opt.additional_price;
      end loop;
    end if;

    v_line_sub := v_line_unit * v_qty;
    update public.order_items set unit_price = v_line_unit, subtotal = v_line_sub
      where id = v_order_item.id;
    v_subtotal := v_subtotal + v_line_sub;
  end loop;

  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from public.promotions
      where upper(code) = upper(trim(p_promo_code))
        and is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (usage_limit is null or usage_count < usage_limit)
      for update;
    if found then
      if v_subtotal < v_promo.min_order_amount then
        raise exception 'Order does not meet the promo minimum';
      end if;
      if v_promo.discount_type = 'percent' then
        v_discount := round(v_subtotal * v_promo.discount_value / 100.0, 2);
      else
        v_discount := least(v_promo.discount_value, v_subtotal);
      end if;
      update public.promotions set usage_count = usage_count + 1 where id = v_promo.id;
    else
      select rr.id as id, r.discount_type as discount_type, r.discount_value as discount_value
        into v_redemption
        from public.reward_redemptions rr
        join public.rewards r on r.id = rr.reward_id
        where upper(rr.code) = upper(trim(p_promo_code))
          and rr.user_id = v_user and rr.is_used = false
        for update;
      if not found then raise exception 'Promo code is not valid for this order'; end if;
      if v_redemption.discount_type = 'percent' then
        v_discount := round(v_subtotal * v_redemption.discount_value / 100.0, 2);
      else
        v_discount := least(v_redemption.discount_value, v_subtotal);
      end if;
      update public.reward_redemptions set is_used = true where id = v_redemption.id;
    end if;
  end if;

  v_total  := greatest(0, v_subtotal - v_discount);
  v_points := floor(v_total)::int;

  select last_order_date into v_last_date from public.users where id = v_user for update;
  v_is_new_day := (v_last_date is distinct from current_date);
  if v_last_date = current_date then
    select current_streak into v_streak from public.users where id = v_user;
  elsif v_last_date = current_date - 1 then
    select current_streak + 1 into v_streak from public.users where id = v_user;
  else
    v_streak := 1;
  end if;

  -- Streak milestone is folded into the PENDING points (awarded on completion).
  if v_is_new_day and v_streak > 0 and v_streak % 5 = 0 then
    v_points := v_points + 50;
  end if;

  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount,
        total_amount = v_total,
        promo_code = nullif(trim(coalesce(p_promo_code, '')), ''),
        payment_status = case when v_pay = 'GCash' then 'paid'::payment_status
                              else 'pending'::payment_status end,
        paid_at = case when v_pay = 'GCash' then now() else null end,
        points_earned = v_points,
        points_state = 'pending',
        status = 'pending'
    where id = v_order.id
    returning * into v_order;

  -- Points are PENDING — only the streak advances now; the balance is credited
  -- when the order is completed (see advance_order_status).
  update public.users
    set current_streak = v_streak,
        last_order_date = current_date
    where id = v_user;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'subtotal', v_subtotal, 'discount_amount', v_discount, 'total_amount', v_total,
    'points_earned', v_points, 'current_streak', v_streak, 'idempotent', false);
end; $$;

-- ----------------------------------------------------------------------------
-- 3. advance_order_status — pay-before-preparing gate + award on completion
-- ----------------------------------------------------------------------------
create or replace function public.advance_order_status(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_next order_status;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  case v_order.status
    when 'pending' then
      -- CASH RULE: must be paid before preparation can begin.
      if v_order.payment_method = 'Cash' and v_order.payment_status <> 'paid' then
        raise exception 'Confirm cash payment before preparing this order';
      end if;
      v_next := 'preparing';
    when 'preparing' then v_next := 'ready';
    when 'ready' then
      if v_order.payment_method = 'Cash' and v_order.payment_status <> 'paid' then
        raise exception 'Confirm cash payment before completing this order';
      end if;
      v_next := 'completed';
    else
      raise exception 'Order cannot be advanced from %', v_order.status;
  end case;

  update public.orders set status = v_next where id = p_order_id;

  -- Award the pending points exactly once, on completion.
  if v_next = 'completed' and v_order.points_state = 'pending' then
    if v_order.points_earned > 0 then
      update public.users
        set loyalty_points = loyalty_points + v_order.points_earned
        where id = v_order.user_id;
      insert into public.loyalty_transactions (user_id, order_id, points, type, description)
      values (v_order.user_id, p_order_id, v_order.points_earned, 'earn',
              'Points earned from order ' || coalesce(v_order.order_number, ''));
    end if;
    update public.orders set points_state = 'earned' where id = p_order_id;
  end if;

  return jsonb_build_object('status', v_next);
end; $$;

-- ----------------------------------------------------------------------------
-- 4. Shared cancellation core + staff and customer entry points
-- ----------------------------------------------------------------------------
create or replace function public._revert_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_it    record;
  v_promo public.promotions%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  -- Restore inventory.
  for v_it in select product_variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.branch_inventory
      set stock_quantity = stock_quantity + v_it.quantity,
          is_available = true,
          updated_at = now()
      where branch_id = v_order.branch_id and product_variant_id = v_it.product_variant_id;
  end loop;

  -- Reverse points ONLY if they were already credited (state 'earned').
  -- Pending points were never added to the balance, so nothing to debit.
  if v_order.points_state = 'earned' and v_order.points_earned > 0 then
    update public.users
      set loyalty_points = greatest(0, loyalty_points - v_order.points_earned)
      where id = v_order.user_id;
    insert into public.loyalty_transactions (user_id, order_id, points, type, description)
    values (v_order.user_id, p_order_id, -v_order.points_earned, 'adjust',
            'Reversal: order ' || coalesce(v_order.order_number, '') || ' cancelled');
  end if;

  -- Restore promotion usage, or return a reward voucher.
  if v_order.promo_code is not null then
    select * into v_promo from public.promotions where upper(code) = upper(v_order.promo_code);
    if found then
      update public.promotions set usage_count = greatest(0, usage_count - 1) where id = v_promo.id;
    else
      update public.reward_redemptions set is_used = false
        where upper(code) = upper(v_order.promo_code) and user_id = v_order.user_id;
    end if;
  end if;

  update public.orders
    set status = 'cancelled',
        points_state = 'reversed',
        payment_status = case when payment_status = 'paid' then 'failed'::payment_status
                              else payment_status end,
        paid_at = null,
        notes = case when coalesce(p_reason, '') = '' then notes
                     else notes || ' [Cancelled: ' || left(p_reason, 200) || ']' end
    where id = p_order_id;
end; $$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Order can no longer be cancelled';
  end if;
  perform public._revert_order(p_order_id, p_reason);
  return jsonb_build_object('status', 'cancelled');
end; $$;

-- Customers may cancel ONLY while the order is still 'pending' (not yet started).
create or replace function public.cancel_my_order(p_order_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> auth.uid() then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then
    raise exception 'This order can no longer be cancelled. Please ask staff for help.';
  end if;
  perform public._revert_order(p_order_id, p_reason);
  return jsonb_build_object('status', 'cancelled');
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
