-- =============================================================================
-- CAFINITY — Phase 3: Functional & Security Hardening
-- Run AFTER schema.sql + seed.sql + phase2.sql, in the Supabase SQL Editor.
-- Idempotent / safe to re-run.
--
-- Fixes: profile/order privilege escalation, controlled status transitions,
-- idempotent checkout, strict place_order validation, closed-by-default
-- inventory, atomic cancellation, Cash-vs-GCash payment, streak milestone,
-- atomic reward redemption + usable vouchers, per-item notes, secure feedback.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SCHEMA ADDITIONS
-- -----------------------------------------------------------------------------

-- Idempotency key for checkout
alter table public.orders add column if not exists checkout_request_id uuid;
create unique index if not exists uniq_orders_checkout_request
  on public.orders(checkout_request_id) where checkout_request_id is not null;

-- Per-item special instructions
alter table public.order_items add column if not exists item_notes text not null default '';

-- Loyalty points can never go negative
do $$ begin
  alter table public.users add constraint users_points_nonneg check (loyalty_points >= 0);
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. CLOSED-BY-DEFAULT INVENTORY PROVISIONING
--    A variant with no branch_inventory row is UNAVAILABLE. New variants and
--    new branches get rows automatically (stock 0, unavailable).
-- -----------------------------------------------------------------------------
create or replace function public.provision_variant_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_inventory (branch_id, product_variant_id, stock_quantity, is_available)
  select b.id, new.id, 0, false from public.branches b where b.is_active
  on conflict (branch_id, product_variant_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_variant_inventory on public.product_variants;
create trigger trg_variant_inventory after insert on public.product_variants
  for each row execute function public.provision_variant_inventory();

create or replace function public.provision_branch_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_inventory (branch_id, product_variant_id, stock_quantity, is_available)
  select new.id, v.id, 0, false from public.product_variants v where v.deleted_at is null
  on conflict (branch_id, product_variant_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_branch_inventory on public.branches;
create trigger trg_branch_inventory after insert on public.branches
  for each row execute function public.provision_branch_inventory();

-- Backfill any existing variant/branch combination that has no inventory row.
insert into public.branch_inventory (branch_id, product_variant_id, stock_quantity, is_available)
select b.id, v.id, 0, false
from public.branches b
cross join public.product_variants v
where b.is_active and v.deleted_at is null
on conflict (branch_id, product_variant_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. COLLISION-SAFE ORDER NUMBERS (serialize numbering within a txn)
-- -----------------------------------------------------------------------------
create or replace function public.set_order_number()
returns trigger language plpgsql as $$
declare seq int;
begin
  if new.order_number is null then
    perform pg_advisory_xact_lock(hashtext('cafinity_order_number'));
    select count(*) + 1 into seq from public.orders where created_at::date = current_date;
    new.order_number := 'CF-' || to_char(now(), 'YYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end; $$;

-- -----------------------------------------------------------------------------
-- 4. RPC: place_order  — validated + idempotent
-- -----------------------------------------------------------------------------
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

  -- Idempotency: a repeat of the same request returns the existing order.
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

  -- Create the order shell (idempotent insert).
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

  -- Lines --------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 20 then
      raise exception 'Quantity for each item must be between 1 and 20';
    end if;
    v_total_qty := v_total_qty + v_qty;
    if v_total_qty > 50 then raise exception 'Order exceeds the maximum item count'; end if;

    -- Variant must exist, not soft-deleted, and available.
    select * into v_variant from public.product_variants
      where id = (v_item->>'product_variant_id')::uuid
        and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected item is no longer available'; end if;

    -- Parent product must exist, not soft-deleted, and available.
    select * into v_product from public.products
      where id = v_variant.product_id and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected product is no longer available'; end if;

    -- Inventory REQUIRED (closed-by-default) and sufficient; row is locked.
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

    -- Customizations: must belong to the product; single-select = one only.
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

  -- Promotion OR reward voucher ----------------------------------------------
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
      -- Reward voucher owned by this user and not yet used.
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

  -- Streak (lock the user row) -----------------------------------------------
  select last_order_date into v_last_date from public.users where id = v_user for update;
  v_is_new_day := (v_last_date is distinct from current_date);
  if v_last_date = current_date then
    select current_streak into v_streak from public.users where id = v_user;
  elsif v_last_date = current_date - 1 then
    select current_streak + 1 into v_streak from public.users where id = v_user;
  else
    v_streak := 1;
  end if;

  -- Milestone bonus ONLY when the streak advances to a multiple of 5 today.
  if v_is_new_day and v_streak > 0 and v_streak % 5 = 0 then
    v_points := v_points + 50;
  end if;

  -- Payment: GCash (simulated) = paid; Cash = pending until staff confirms.
  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount,
        total_amount = v_total,
        promo_code = nullif(trim(coalesce(p_promo_code, '')), ''),
        payment_status = case when v_pay = 'GCash' then 'paid'::payment_status
                              else 'pending'::payment_status end,
        paid_at = case when v_pay = 'GCash' then now() else null end,
        points_earned = v_points,
        status = 'pending'
    where id = v_order.id
    returning * into v_order;

  update public.users
    set loyalty_points = loyalty_points + v_points,
        current_streak = v_streak,
        last_order_date = current_date
    where id = v_user;

  insert into public.loyalty_transactions (user_id, order_id, points, type, description)
  values (v_user, v_order.id, floor(v_total)::int, 'earn',
          'Points earned from order ' || v_order.order_number);

  if v_is_new_day and v_streak > 0 and v_streak % 5 = 0 then
    insert into public.loyalty_transactions (user_id, order_id, points, type, description)
    values (v_user, v_order.id, 50, 'bonus', v_streak || '-day streak bonus');
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'subtotal', v_subtotal, 'discount_amount', v_discount, 'total_amount', v_total,
    'points_earned', v_points, 'current_streak', v_streak, 'idempotent', false);
end; $$;

-- -----------------------------------------------------------------------------
-- 5. RPC: redeem_reward — atomic, no negative balance
-- -----------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_reward public.rewards%rowtype;
  v_code   text;
  v_after  int;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_reward from public.rewards where id = p_reward_id and is_active = true;
  if not found then raise exception 'Reward not available'; end if;

  v_code := 'RWD-' || upper(substring(replace(gen_random_uuid()::text, '-', '') for 8));

  -- Conditional atomic debit: only succeeds if enough points remain.
  update public.users
    set loyalty_points = loyalty_points - v_reward.points_cost
    where id = v_user and loyalty_points >= v_reward.points_cost
    returning loyalty_points into v_after;
  if not found then raise exception 'Not enough points'; end if;

  insert into public.reward_redemptions
    (user_id, reward_id, reward_name, points_spent, code)
  values (v_user, v_reward.id, v_reward.name, v_reward.points_cost, v_code);

  insert into public.loyalty_transactions (user_id, points, type, description)
  values (v_user, -v_reward.points_cost, 'redeem', 'Redeemed: ' || v_reward.name);

  return jsonb_build_object('code', v_code, 'reward_name', v_reward.name,
                            'points_spent', v_reward.points_cost);
end; $$;

-- -----------------------------------------------------------------------------
-- 6. RPC: controlled order workflow (staff/admin only)
-- -----------------------------------------------------------------------------
create or replace function public.advance_order_status(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_next order_status;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  case v_order.status
    when 'pending'   then v_next := 'preparing';
    when 'preparing' then v_next := 'ready';
    when 'ready'     then
      if v_order.payment_method = 'Cash' and v_order.payment_status <> 'paid' then
        raise exception 'Confirm cash payment before completing this order';
      end if;
      v_next := 'completed';
    else
      raise exception 'Order cannot be advanced from %', v_order.status;
  end case;

  update public.orders set status = v_next where id = p_order_id;
  return jsonb_build_object('status', v_next);
end; $$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_it    record;
  v_promo public.promotions%rowtype;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Order can no longer be cancelled';
  end if;

  -- Restore inventory.
  for v_it in select product_variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.branch_inventory
      set stock_quantity = stock_quantity + v_it.quantity,
          is_available = true,
          updated_at = now()
      where branch_id = v_order.branch_id and product_variant_id = v_it.product_variant_id;
  end loop;

  -- Reverse loyalty points (floored at zero) and record the adjustment.
  if v_order.points_earned > 0 then
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

  -- Cancel + void simulated payment.
  update public.orders
    set status = 'cancelled',
        payment_status = case when payment_status = 'paid' then 'failed'::payment_status
                              else payment_status end,
        paid_at = null,
        notes = case when coalesce(p_reason, '') = '' then notes
                     else notes || ' [Cancelled: ' || left(p_reason, 200) || ']' end
    where id = p_order_id;

  return jsonb_build_object('status', 'cancelled');
end; $$;

create or replace function public.confirm_cash_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method <> 'Cash' then raise exception 'Order is not a cash order'; end if;
  if v_order.status = 'cancelled' then raise exception 'Order was cancelled'; end if;
  update public.orders set payment_status = 'paid', paid_at = now() where id = p_order_id;
end; $$;

-- -----------------------------------------------------------------------------
-- 7. RPC: restricted profile update (names only)
-- -----------------------------------------------------------------------------
create or replace function public.update_my_profile(p_first_name text, p_last_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.users
    set first_name = left(trim(coalesce(p_first_name, '')), 50),
        last_name  = left(trim(coalesce(p_last_name, '')), 50)
    where id = auth.uid();
end; $$;

-- -----------------------------------------------------------------------------
-- 8. RPC: feedback only on own completed orders
-- -----------------------------------------------------------------------------
create or replace function public.submit_feedback(p_order_id uuid, p_rating int, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> auth.uid() then raise exception 'Order not found'; end if;
  if v_order.status <> 'completed' then
    raise exception 'You can only review completed orders';
  end if;
  insert into public.feedback (order_id, user_id, rating, comment)
  values (p_order_id, auth.uid(), p_rating, left(coalesce(p_comment, ''), 500))
  on conflict (order_id, user_id) do update
    set rating = excluded.rating, comment = excluded.comment;
end; $$;

-- -----------------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY: lock down direct writes (mutations go through RPCs)
-- -----------------------------------------------------------------------------

-- users: no direct row updates (names via update_my_profile, roles via set_user_role)
drop policy if exists users_update_own on public.users;

-- orders: customers/staff read; NO direct insert or update (RPCs only)
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id or public.is_staff_or_admin());

-- order_items / customizations: read-only (written by place_order)
drop policy if exists order_items_rw on public.order_items;
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = auth.uid() or public.is_staff_or_admin())));

drop policy if exists order_item_cust_rw on public.order_item_customization;
drop policy if exists order_item_cust_read on public.order_item_customization;
create policy order_item_cust_read on public.order_item_customization
  for select using (exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and (o.user_id = auth.uid() or public.is_staff_or_admin())));

-- feedback: read own (or admin); writes go through submit_feedback only
drop policy if exists feedback_rw_own on public.feedback;
drop policy if exists feedback_admin_read on public.feedback;
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select using (auth.uid() = user_id or public.is_admin());

-- =============================================================================
-- DONE.
-- =============================================================================
