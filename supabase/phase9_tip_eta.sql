-- ============================================================================
-- Phase 9 (Batch 3) — Tipping + estimated preparation time (ETA)
-- Run AFTER phase8_statutory.sql. Idempotent.
--
-- TIP: optional, defaults to none. Base = discounted merchandise (excl. service
-- fee / delivery). Not eligible for points, not discounted, stored separately,
-- refunded with the order on cancellation. Admin can disable via
-- app_settings.tipping_enabled.
--
-- ETA: a RANGE (never an exact promise), queue-based, snapshotted on the order,
-- recomputed when preparing starts, cleared once Ready.
-- ============================================================================

-- 1. Branch ETA configuration ------------------------------------------------
alter table public.branches
  add column if not exists eta_enabled           boolean       not null default true,
  add column if not exists base_prep_minutes     int           not null default 5,
  add column if not exists avg_minutes_per_item  numeric(5,2)  not null default 2,
  add column if not exists active_staff_capacity int           not null default 1,
  add column if not exists max_eta_minutes       int           not null default 45;

-- 2. Order ETA snapshots -----------------------------------------------------
alter table public.orders
  add column if not exists estimated_min_minutes int,
  add column if not exists estimated_max_minutes int,
  add column if not exists estimated_ready_at    timestamptz,
  add column if not exists eta_calculated_at     timestamptz;

-- 3. Queue-based ETA estimate ------------------------------------------------
create or replace function public.compute_eta(
  p_branch_id uuid, p_item_count int, p_exclude_order uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b       public.branches%rowtype;
  v_queue int;
  v_cap   int;
  v_est   int;
  v_min   int;
  v_max   int;
begin
  select * into b from public.branches where id = p_branch_id;
  if not found or not b.eta_enabled then
    return jsonb_build_object('enabled', false);
  end if;

  -- Items in orders ahead (still pending/preparing) at this branch.
  select coalesce(sum(oi.quantity), 0) into v_queue
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.branch_id = p_branch_id
      and o.status in ('pending', 'preparing')
      and (p_exclude_order is null or o.id <> p_exclude_order);

  v_cap := greatest(1, coalesce(b.active_staff_capacity, 1));
  v_est := coalesce(b.base_prep_minutes, 5)
           + ceil((v_queue + greatest(0, coalesce(p_item_count, 0)))
                  * coalesce(b.avg_minutes_per_item, 2) / v_cap)::int;
  if b.max_eta_minutes is not null then v_est := least(v_est, b.max_eta_minutes); end if;

  v_min := v_est;
  v_max := v_est + greatest(5, ceil(v_est * 0.3)::int);
  if b.max_eta_minutes is not null then v_max := least(v_max, b.max_eta_minutes + 5); end if;

  return jsonb_build_object('enabled', true, 'min', v_min, 'max', v_max);
end; $$;

-- 4. quote_order — now returns a tip-aware total + an ETA range ---------------
create or replace function public.quote_order(
  p_branch_id  uuid,
  p_promo_code text,
  p_items      jsonb,
  p_tip        numeric default 0,
  p_statutory  text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user        uuid := auth.uid();
  v_item        jsonb;
  v_cust        jsonb;
  v_variant     public.product_variants%rowtype;
  v_product     public.products%rowtype;
  v_inv         public.branch_inventory%rowtype;
  v_opt         public.customization_options%rowtype;
  v_qty         int;
  v_total_qty   int := 0;
  v_line_unit   numeric(10,2);
  v_subtotal    numeric(10,2) := 0;
  v_cust_total  numeric(10,2) := 0;
  v_promo       public.promotions%rowtype;
  v_redemption  record;
  v_promo_disc  numeric(10,2) := 0;
  v_reward_disc numeric(10,2) := 0;
  v_is_stat     boolean := coalesce(p_statutory, '') in ('PWD', 'Senior');
  v_fin         jsonb;
  v_eta         jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  if not exists (select 1 from public.branches where id = p_branch_id and is_active = true) then
    raise exception 'Branch is not available';
  end if;
  if v_is_stat and p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    raise exception 'A PWD/Senior discount cannot be combined with a promo or voucher';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 20 then raise exception 'Quantity for each item must be between 1 and 20'; end if;
    v_total_qty := v_total_qty + v_qty;
    if v_total_qty > 50 then raise exception 'Order exceeds the maximum item count'; end if;

    select * into v_variant from public.product_variants
      where id = (v_item->>'product_variant_id')::uuid and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected item is no longer available'; end if;
    select * into v_product from public.products
      where id = v_variant.product_id and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected product is no longer available'; end if;
    select * into v_inv from public.branch_inventory
      where branch_id = p_branch_id and product_variant_id = v_variant.id;
    if not found or v_inv.is_available = false or v_inv.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    v_line_unit := v_variant.price;
    if v_item ? 'customizations' then
      for v_cust in select * from jsonb_array_elements(v_item->'customizations')
      loop
        select * into v_opt from public.customization_options
          where id = (v_cust->>'customization_option_id')::uuid;
        if not found then raise exception 'Invalid customization option'; end if;
        if not exists (select 1 from public.product_customization_link l
                       where l.product_id = v_product.id and l.group_id = v_opt.group_id) then
          raise exception 'Customization is not allowed for %', v_product.name;
        end if;
        v_line_unit  := v_line_unit + v_opt.additional_price;
        v_cust_total := v_cust_total + v_opt.additional_price * v_qty;
      end loop;
    end if;
    v_subtotal := v_subtotal + v_line_unit * v_qty;
  end loop;

  if not v_is_stat and p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from public.promotions
      where upper(code) = upper(trim(p_promo_code)) and is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (usage_limit is null or usage_count < usage_limit);
    if found then
      if v_subtotal >= v_promo.min_order_amount then
        v_promo_disc := case when v_promo.discount_type = 'percent'
          then round(v_subtotal * v_promo.discount_value / 100.0, 2)
          else least(v_promo.discount_value, v_subtotal) end;
      end if;
    else
      select r.discount_type as discount_type, r.discount_value as discount_value into v_redemption
        from public.reward_redemptions rr join public.rewards r on r.id = rr.reward_id
        where upper(rr.code) = upper(trim(p_promo_code)) and rr.user_id = v_user
          and rr.is_used = false and (rr.expires_at is null or rr.expires_at >= now());
      if found then
        v_reward_disc := case when v_redemption.discount_type = 'percent'
          then round(v_subtotal * v_redemption.discount_value / 100.0, 2)
          else least(v_redemption.discount_value, v_subtotal) end;
      end if;
    end if;
  end if;

  v_fin := public.compute_order_pricing(
    v_subtotal, v_cust_total, v_promo_disc, v_reward_disc,
    case when v_is_stat then p_statutory else null end, true,
    greatest(0, least(coalesce(p_tip, 0), 100000)), 0);
  v_eta := public.compute_eta(p_branch_id, v_total_qty, null);

  return v_fin
    || jsonb_build_object(
         'eta_enabled', coalesce((v_eta->>'enabled')::boolean, false),
         'eta_min', v_eta->'min',
         'eta_max', v_eta->'max');
end; $$;

-- 5. place_order — accept a tip + snapshot the ETA ---------------------------
create or replace function public.place_order(
  p_branch_id           uuid,
  p_payment_method      text,
  p_promo_code          text,
  p_notes               text,
  p_items               jsonb,
  p_checkout_request_id uuid default null,
  p_statutory           text default null,
  p_holder_name         text default null,
  p_id_number           text default null,
  p_tip                 numeric default 0
)
returns jsonb
language plpgsql security definer set search_path = public
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
  v_cust_total  numeric(10,2) := 0;
  v_promo_disc  numeric(10,2) := 0;
  v_reward_disc numeric(10,2) := 0;
  v_discount    numeric(10,2) := 0;
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
  v_is_stat     boolean := coalesce(p_statutory, '') in ('PWD', 'Senior');
  v_idn         text;
  v_masked      text;
  v_tip         numeric(10,2) := greatest(0, least(round(coalesce(p_tip, 0), 2), 100000));
  v_fin         jsonb;
  v_eta         jsonb;
  v_total       numeric(10,2);
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

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;

  v_pay := coalesce(p_payment_method, 'GCash');
  if v_pay not in ('GCash', 'Cash') then raise exception 'Invalid payment method'; end if;

  if v_is_stat then
    if v_pay <> 'Cash' then raise exception 'PWD/Senior discounts require Cash payment'; end if;
    if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
      raise exception 'A PWD/Senior discount cannot be combined with a promo or voucher';
    end if;
    if coalesce(trim(p_holder_name), '') = '' then raise exception 'Cardholder name is required'; end if;
    v_idn := coalesce(trim(p_id_number), '');
    if v_idn = '' then raise exception 'ID number is required'; end if;
    if length(v_idn) > 4 then v_masked := repeat('•', length(v_idn) - 4) || right(v_idn, 4);
    else v_masked := repeat('•', length(v_idn)); end if;
  end if;

  v_notes := coalesce(p_notes, '');
  if length(v_notes) > 500 then raise exception 'Order notes are too long'; end if;

  select * into v_branch from public.branches where id = p_branch_id and is_active = true;
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
    if v_qty < 1 or v_qty > 20 then raise exception 'Quantity for each item must be between 1 and 20'; end if;
    v_total_qty := v_total_qty + v_qty;
    if v_total_qty > 50 then raise exception 'Order exceeds the maximum item count'; end if;

    select * into v_variant from public.product_variants
      where id = (v_item->>'product_variant_id')::uuid and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected item is no longer available'; end if;
    select * into v_product from public.products
      where id = v_variant.product_id and deleted_at is null and is_available = true;
    if not found then raise exception 'A selected product is no longer available'; end if;

    select * into v_inv from public.branch_inventory
      where branch_id = p_branch_id and product_variant_id = v_variant.id for update;
    if not found then raise exception '% is not available at this branch', v_product.name; end if;
    if v_inv.is_available = false or v_inv.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;
    update public.branch_inventory
      set stock_quantity = stock_quantity - v_qty,
          is_available = (stock_quantity - v_qty) > 0, updated_at = now()
      where id = v_inv.id;

    v_line_unit  := v_variant.price;
    v_item_notes := left(coalesce(v_item->>'item_notes', ''), 200);

    insert into public.order_items (order_id, product_variant_id, product_name,
                                    variant_name, quantity, unit_price, subtotal, item_notes)
    values (v_order.id, v_variant.id, v_product.name, v_variant.name, v_qty, v_line_unit, 0, v_item_notes)
    returning * into v_order_item;

    v_single_seen := '{}';
    if v_item ? 'customizations' then
      for v_cust in select * from jsonb_array_elements(v_item->'customizations')
      loop
        select * into v_opt from public.customization_options
          where id = (v_cust->>'customization_option_id')::uuid;
        if not found then raise exception 'Invalid customization option'; end if;
        if not exists (select 1 from public.product_customization_link l
                       where l.product_id = v_product.id and l.group_id = v_opt.group_id) then
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
        v_line_unit  := v_line_unit + v_opt.additional_price;
        v_cust_total := v_cust_total + v_opt.additional_price * v_qty;
      end loop;
    end if;

    v_line_sub := v_line_unit * v_qty;
    update public.order_items set unit_price = v_line_unit, subtotal = v_line_sub where id = v_order_item.id;
    v_subtotal := v_subtotal + v_line_sub;
  end loop;

  if not v_is_stat and p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from public.promotions
      where upper(code) = upper(trim(p_promo_code)) and is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (usage_limit is null or usage_count < usage_limit)
      for update;
    if found then
      if v_subtotal < v_promo.min_order_amount then raise exception 'Order does not meet the promo minimum'; end if;
      v_promo_disc := case when v_promo.discount_type = 'percent'
        then round(v_subtotal * v_promo.discount_value / 100.0, 2)
        else least(v_promo.discount_value, v_subtotal) end;
      update public.promotions set usage_count = usage_count + 1 where id = v_promo.id;
    else
      select rr.id as id, r.discount_type as discount_type, r.discount_value as discount_value
        into v_redemption
        from public.reward_redemptions rr join public.rewards r on r.id = rr.reward_id
        where upper(rr.code) = upper(trim(p_promo_code)) and rr.user_id = v_user
          and rr.is_used = false and (rr.expires_at is null or rr.expires_at >= now())
        for update;
      if not found then raise exception 'This voucher is not valid for this order'; end if;
      v_reward_disc := case when v_redemption.discount_type = 'percent'
        then round(v_subtotal * v_redemption.discount_value / 100.0, 2)
        else least(v_redemption.discount_value, v_subtotal) end;
      update public.reward_redemptions
        set is_used = true, used_at = now(), used_order_id = v_order.id
        where id = v_redemption.id;
    end if;
  end if;

  v_fin := public.compute_order_pricing(v_subtotal, v_cust_total, v_promo_disc, v_reward_disc,
             case when v_is_stat then p_statutory else null end, true, v_tip, 0);
  v_discount := (v_fin->>'promo_discount')::numeric + (v_fin->>'loyalty_reward_discount')::numeric
                + (v_fin->>'statutory_discount')::numeric;
  v_total  := (v_fin->>'final_total')::numeric;
  v_points := (v_fin->>'points_to_earn')::int;

  select last_order_date into v_last_date from public.users where id = v_user for update;
  v_is_new_day := (v_last_date is distinct from current_date);
  if v_last_date = current_date then
    select current_streak into v_streak from public.users where id = v_user;
  elsif v_last_date = current_date - 1 then
    select current_streak + 1 into v_streak from public.users where id = v_user;
  else
    v_streak := 1;
  end if;
  if v_is_new_day and v_streak > 0 and v_streak % 5 = 0 then v_points := v_points + 50; end if;

  v_eta := public.compute_eta(p_branch_id, v_total_qty, v_order.id);

  update public.orders
    set subtotal = v_subtotal,
        customization_total = v_cust_total,
        discount_amount = v_discount,
        promo_discount = (v_fin->>'promo_discount')::numeric,
        loyalty_reward_discount = (v_fin->>'loyalty_reward_discount')::numeric,
        statutory_discount = (v_fin->>'statutory_discount')::numeric,
        vat_exempt_amount = (v_fin->>'vat_exempt_amount')::numeric,
        vat_amount = (v_fin->>'vat_amount')::numeric,
        service_fee = (v_fin->>'service_fee')::numeric,
        delivery_fee = 0,
        tip_amount = v_tip,
        points_eligible_amount = (v_fin->>'points_eligible_amount')::numeric,
        vat_rate_snapshot = (v_fin->>'vat_rate')::numeric,
        prices_vat_inclusive_snapshot = (v_fin->>'prices_vat_inclusive')::boolean,
        statutory_discount_type = nullif(coalesce(p_statutory, ''), ''),
        discount_verification = case when v_is_stat then 'pending_verification' else 'not_requested' end,
        discount_holder_name = case when v_is_stat then trim(p_holder_name) else null end,
        discount_masked_id = case when v_is_stat then v_masked else null end,
        estimated_min_minutes = case when (v_eta->>'enabled')::boolean then (v_eta->>'min')::int else null end,
        estimated_max_minutes = case when (v_eta->>'enabled')::boolean then (v_eta->>'max')::int else null end,
        estimated_ready_at = case when (v_eta->>'enabled')::boolean
                                  then now() + ((v_eta->>'max') || ' minutes')::interval else null end,
        eta_calculated_at = case when (v_eta->>'enabled')::boolean then now() else null end,
        total_amount = v_total,
        promo_code = nullif(trim(coalesce(p_promo_code, '')), ''),
        payment_status = case when v_pay = 'GCash' then 'paid'::payment_status else 'pending'::payment_status end,
        paid_at = case when v_pay = 'GCash' then now() else null end,
        points_earned = v_points,
        points_state = 'pending',
        status = 'pending'
    where id = v_order.id
    returning * into v_order;

  update public.users set current_streak = v_streak, last_order_date = current_date where id = v_user;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'subtotal', v_subtotal, 'discount_amount', v_discount, 'total_amount', v_total,
    'tip_amount', v_tip, 'points_earned', v_points, 'current_streak', v_streak, 'idempotent', false);
end; $$;

-- 6. advance_order_status — refresh ETA on preparing, clear it once Ready -----
create or replace function public.advance_order_status(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_next  order_status;
  v_count int;
  v_eta   jsonb;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  case v_order.status
    when 'pending' then
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

  -- ETA lifecycle.
  if v_next = 'preparing' then
    select coalesce(sum(quantity), 0) into v_count from public.order_items where order_id = p_order_id;
    v_eta := public.compute_eta(v_order.branch_id, v_count, p_order_id);
    if (v_eta->>'enabled')::boolean then
      update public.orders
        set estimated_min_minutes = (v_eta->>'min')::int,
            estimated_max_minutes = (v_eta->>'max')::int,
            estimated_ready_at = now() + ((v_eta->>'max') || ' minutes')::interval,
            eta_calculated_at = now()
        where id = p_order_id;
    end if;
  elsif v_next in ('ready', 'completed') then
    update public.orders
      set estimated_min_minutes = null, estimated_max_minutes = null, estimated_ready_at = null
      where id = p_order_id;
  end if;

  -- Award pending points on completion (unchanged).
  if v_next = 'completed' and v_order.points_state = 'pending' then
    if v_order.points_earned > 0 then
      update public.users set loyalty_points = loyalty_points + v_order.points_earned
        where id = v_order.user_id;
      insert into public.loyalty_transactions (user_id, order_id, points, type, description)
      values (v_order.user_id, p_order_id, v_order.points_earned, 'earn',
              'Points earned from order ' || coalesce(v_order.order_number, ''));
    end if;
    update public.orders set points_state = 'earned' where id = p_order_id;
  end if;

  return jsonb_build_object('status', v_next);
end; $$;

-- 7. Staff manual ETA adjustment ---------------------------------------------
create or replace function public.set_order_eta(p_order_id uuid, p_min int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  if p_min < 0 or p_max < p_min then raise exception 'Invalid ETA range'; end if;
  update public.orders
    set estimated_min_minutes = p_min,
        estimated_max_minutes = p_max,
        estimated_ready_at = now() + (p_max || ' minutes')::interval,
        eta_calculated_at = now()
    where id = p_order_id and status in ('pending', 'preparing');
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
