-- ============================================================================
-- Phase 8 (Batch 2) — PWD / Senior statutory discounts
-- Run AFTER phase7_pricing.sql. Idempotent.
--
-- POLICY (chosen): statutory discounts are CASH-ONLY. The order is placed as
-- 'pending_verification'; staff verify the physical ID at the counter BEFORE
-- confirming cash. Reject recomputes the order to full price (cash, no refund).
--
-- LEGALLY-CORRECT MATH (RA 10754 / RR 5-2017), VAT-inclusive prices:
--   vat_exclusive   = price / 1.12
--   vat_exemption   = price - vat_exclusive        (the 12% removed)
--   statutory_disc  = vat_exclusive * 20%
--   payable merch   = vat_exclusive - statutory_disc
-- No double discount: statutory cannot combine with a promo or loyalty voucher.
-- ============================================================================

-- 1. Statutory / verification columns ----------------------------------------
alter table public.orders
  add column if not exists statutory_discount_type   text,
  add column if not exists discount_verification      text not null default 'not_requested',
  add column if not exists discount_holder_name       text,
  add column if not exists discount_masked_id         text,
  add column if not exists discount_verified_by       uuid references public.users(id),
  add column if not exists discount_verified_at        timestamptz,
  add column if not exists discount_rejection_reason   text;

do $$ begin
  alter table public.orders add constraint orders_discount_verification_chk
    check (discount_verification in
      ('not_requested','pending_verification','verified','rejected','expired'));
exception when duplicate_object then null; end $$;

-- 2. Unified pricing function (supersedes finalize_pricing for callers) -------
create or replace function public.compute_order_pricing(
  p_subtotal    numeric,
  p_cust_total  numeric,
  p_promo_disc  numeric,
  p_reward_disc numeric,
  p_statutory   text,
  p_is_pickup   boolean,
  p_tip         numeric,
  p_delivery    numeric
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s          public.app_settings%rowtype;
  v_rate     numeric;
  v_is_stat  boolean := coalesce(p_statutory, '') in ('PWD', 'Senior');
  v_vatexcl  numeric(10,2);
  v_exempt   numeric(10,2) := 0;
  v_stat     numeric(10,2) := 0;
  v_vat      numeric(10,2) := 0;
  v_merch    numeric(10,2);
  v_service  numeric(10,2);
  v_final    numeric(10,2);
begin
  select * into s from public.app_settings where id;
  v_rate := coalesce(s.vat_rate, 0.12);

  if v_is_stat then
    if s.business_is_vat_registered and s.prices_are_vat_inclusive then
      v_vatexcl := round(p_subtotal / (1 + v_rate), 2);
      v_exempt  := round(p_subtotal - v_vatexcl, 2);
    else
      v_vatexcl := p_subtotal;
    end if;
    v_stat  := round(v_vatexcl * 0.20, 2);
    v_merch := greatest(0, v_vatexcl - v_stat);
    v_vat   := 0;
  else
    v_merch := greatest(0, p_subtotal - coalesce(p_promo_disc, 0) - coalesce(p_reward_disc, 0));
    if s.business_is_vat_registered and s.prices_are_vat_inclusive then
      v_vat := round(v_merch * v_rate / (1 + v_rate), 2);
    elsif s.business_is_vat_registered then
      v_vat := round(v_merch * v_rate, 2);
    end if;
  end if;

  v_service := public.calc_service_fee(v_merch, p_is_pickup);

  if s.business_is_vat_registered and not s.prices_are_vat_inclusive and not v_is_stat then
    v_final := v_merch + v_vat + v_service + coalesce(p_tip, 0) + coalesce(p_delivery, 0);
  else
    v_final := v_merch + v_service + coalesce(p_tip, 0) + coalesce(p_delivery, 0);
  end if;

  return jsonb_build_object(
    'merchandise_subtotal', p_subtotal,
    'customization_total', coalesce(p_cust_total, 0),
    'promo_discount', case when v_is_stat then 0 else coalesce(p_promo_disc, 0) end,
    'loyalty_reward_discount', case when v_is_stat then 0 else coalesce(p_reward_disc, 0) end,
    'statutory_discount', v_stat,
    'statutory_type', coalesce(p_statutory, ''),
    'vat_exempt_amount', v_exempt,
    'vat_amount', v_vat,
    'vat_rate', v_rate,
    'prices_vat_inclusive', s.prices_are_vat_inclusive,
    'vat_registered', s.business_is_vat_registered,
    'show_vat_breakdown', s.show_vat_breakdown,
    'service_fee', v_service,
    'delivery_fee', coalesce(p_delivery, 0),
    'tip_amount', coalesce(p_tip, 0),
    'points_eligible_amount', v_merch,
    'points_to_earn', floor(v_merch * coalesce(s.loyalty_points_per_peso, 1))::int,
    'final_total', greatest(0, round(v_final, 2))
  );
end; $$;

-- 3. quote_order — now statutory-aware ---------------------------------------
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

  return public.compute_order_pricing(
    v_subtotal, v_cust_total, v_promo_disc, v_reward_disc,
    case when v_is_stat then p_statutory else null end, true, greatest(0, coalesce(p_tip, 0)), 0);
end; $$;

-- 4. place_order — statutory params + snapshot writes ------------------------
create or replace function public.place_order(
  p_branch_id           uuid,
  p_payment_method      text,
  p_promo_code          text,
  p_notes               text,
  p_items               jsonb,
  p_checkout_request_id uuid default null,
  p_statutory           text default null,
  p_holder_name         text default null,
  p_id_number           text default null
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
  v_fin         jsonb;
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

  -- Statutory rules: cash-only, identity required, no stacking.
  if v_is_stat then
    if v_pay <> 'Cash' then raise exception 'PWD/Senior discounts require Cash payment'; end if;
    if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
      raise exception 'A PWD/Senior discount cannot be combined with a promo or voucher';
    end if;
    if coalesce(trim(p_holder_name), '') = '' then raise exception 'Cardholder name is required'; end if;
    v_idn := coalesce(trim(p_id_number), '');
    if v_idn = '' then raise exception 'ID number is required'; end if;
    if length(v_idn) > 4 then
      v_masked := repeat('•', length(v_idn) - 4) || right(v_idn, 4);
    else
      v_masked := repeat('•', length(v_idn));
    end if;
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

  -- Discount resolution: statutory bypasses promo/voucher entirely.
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

  v_fin    := public.compute_order_pricing(v_subtotal, v_cust_total, v_promo_disc, v_reward_disc,
                case when v_is_stat then p_statutory else null end, true, 0, 0);
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
        tip_amount = 0,
        points_eligible_amount = (v_fin->>'points_eligible_amount')::numeric,
        vat_rate_snapshot = (v_fin->>'vat_rate')::numeric,
        prices_vat_inclusive_snapshot = (v_fin->>'prices_vat_inclusive')::boolean,
        statutory_discount_type = nullif(coalesce(p_statutory, ''), ''),
        discount_verification = case when v_is_stat then 'pending_verification' else 'not_requested' end,
        discount_holder_name = case when v_is_stat then trim(p_holder_name) else null end,
        discount_masked_id = case when v_is_stat then v_masked else null end,
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
    'service_fee', (v_fin->>'service_fee')::numeric, 'vat_amount', (v_fin->>'vat_amount')::numeric,
    'points_earned', v_points, 'current_streak', v_streak, 'idempotent', false);
end; $$;

-- 5. Staff verification of the statutory ID ----------------------------------
create or replace function public.verify_statutory_discount(
  p_order_id uuid, p_approve boolean, p_reason text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_fin jsonb;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.statutory_discount_type is null then raise exception 'No statutory discount on this order'; end if;
  if v_order.discount_verification <> 'pending_verification' then
    raise exception 'This discount is not pending verification';
  end if;

  if p_approve then
    update public.orders
      set discount_verification = 'verified',
          discount_verified_by = auth.uid(),
          discount_verified_at = now()
      where id = p_order_id;
    return jsonb_build_object('status', 'verified');
  end if;

  -- Rejected: recompute the order to full price (no statutory benefit).
  v_fin := public.compute_order_pricing(v_order.subtotal, v_order.customization_total,
             0, 0, null, true, v_order.tip_amount, v_order.delivery_fee);
  update public.orders
    set discount_verification = 'rejected',
        discount_rejection_reason = left(coalesce(p_reason, ''), 200),
        statutory_discount = 0,
        vat_exempt_amount = 0,
        vat_amount = (v_fin->>'vat_amount')::numeric,
        service_fee = (v_fin->>'service_fee')::numeric,
        discount_amount = 0,
        promo_discount = 0,
        loyalty_reward_discount = 0,
        points_eligible_amount = (v_fin->>'points_eligible_amount')::numeric,
        total_amount = (v_fin->>'final_total')::numeric,
        points_earned = (v_fin->>'points_to_earn')::int
    where id = p_order_id;
  return jsonb_build_object('status', 'rejected', 'total_amount', (v_fin->>'final_total')::numeric);
end; $$;

-- 6. confirm_cash_payment — block until any statutory ID is verified ----------
create or replace function public.confirm_cash_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method <> 'Cash' then raise exception 'Order is not a cash order'; end if;
  if v_order.status = 'cancelled' then raise exception 'Order was cancelled'; end if;
  if v_order.statutory_discount_type is not null
     and v_order.discount_verification = 'pending_verification' then
    raise exception 'Verify the PWD/Senior ID before confirming payment';
  end if;
  update public.orders set payment_status = 'paid', paid_at = now() where id = p_order_id;
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
