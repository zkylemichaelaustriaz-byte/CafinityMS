-- phase34_flexible_loyalty.sql
-- Flexible loyalty earning: "earn N points for every ₱U spent" instead of a flat
-- points-per-peso. Formula: floor(eligible_spend / spend_unit) * points_awarded.
--
-- Backward compatible: the old loyalty_points_per_peso column is KEPT (not
-- renamed). New rows default to 1 point per ₱1 (= the previous default), and the
-- pricing helper now reads the new fields via loyalty_points_for(). Re-creates
-- compute_order_pricing and update_app_settings with ONLY the necessary changes.
--
-- Idempotent. Does NOT edit any prior migration.

-- 1. New configurable ratio (singleton app_settings; default = 1 per ₱1). ------
alter table public.app_settings
  add column if not exists loyalty_points_awarded integer       not null default 1,
  add column if not exists loyalty_spend_unit      numeric(10,2) not null default 1;

-- Seed the new fields from the existing rate so behavior doesn't change for the
-- common default (1 per ₱1 -> awarded 1, unit ₱1).
update public.app_settings
   set loyalty_points_awarded = greatest(1, round(coalesce(loyalty_points_per_peso, 1))::int),
       loyalty_spend_unit     = 1
 where id and loyalty_points_awarded = 1 and loyalty_spend_unit = 1;

-- 2. Centralised earning formula (single source of truth). --------------------
create or replace function public.loyalty_points_for(p_merch numeric)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_merch, 0) <= 0 then 0
    else (
      floor(coalesce(p_merch, 0)
            / greatest((select loyalty_spend_unit from public.app_settings where id), 0.01))
      * (select loyalty_points_awarded from public.app_settings where id)
    )::int
  end;
$$;

-- 3. compute_order_pricing — identical to phase8 except the points line. -------
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
    'points_to_earn', public.loyalty_points_for(v_merch),   -- << flexible ratio
    'final_total', greatest(0, round(v_final, 2))
  );
end; $$;

-- 4. update_app_settings — identical to phase13 plus the two new fields. -------
create or replace function public.update_app_settings(p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings%rowtype; k text; v_old text; v_new text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into s from public.app_settings where id;

  for k in select jsonb_object_keys(p_patch) loop
    v_old := to_jsonb(s) ->> k;
    v_new := p_patch ->> k;
    if v_new is distinct from v_old then
      insert into public.app_settings_audit (setting, old_value, new_value, changed_by)
      values (k, v_old, v_new, auth.uid());
    end if;
  end loop;

  update public.app_settings set
    business_is_vat_registered   = coalesce((p_patch->>'business_is_vat_registered')::boolean, business_is_vat_registered),
    vat_rate                     = coalesce((p_patch->>'vat_rate')::numeric, vat_rate),
    prices_are_vat_inclusive     = coalesce((p_patch->>'prices_are_vat_inclusive')::boolean, prices_are_vat_inclusive),
    show_vat_breakdown           = coalesce((p_patch->>'show_vat_breakdown')::boolean, show_vat_breakdown),
    service_fee_enabled          = coalesce((p_patch->>'service_fee_enabled')::boolean, service_fee_enabled),
    service_fee_type             = coalesce(p_patch->>'service_fee_type', service_fee_type),
    service_fee_value            = coalesce((p_patch->>'service_fee_value')::numeric, service_fee_value),
    service_fee_min_order        = coalesce((p_patch->>'service_fee_min_order')::numeric, service_fee_min_order),
    service_fee_max              = case when p_patch ? 'service_fee_max'
                                        then nullif(p_patch->>'service_fee_max', '')::numeric
                                        else service_fee_max end,
    service_fee_applies_pickup   = coalesce((p_patch->>'service_fee_applies_pickup')::boolean, service_fee_applies_pickup),
    service_fee_taxable          = coalesce((p_patch->>'service_fee_taxable')::boolean, service_fee_taxable),
    tipping_enabled              = coalesce((p_patch->>'tipping_enabled')::boolean, tipping_enabled),
    loyalty_points_per_peso      = coalesce((p_patch->>'loyalty_points_per_peso')::numeric, loyalty_points_per_peso),
    loyalty_points_awarded       = coalesce((p_patch->>'loyalty_points_awarded')::int, loyalty_points_awarded),
    loyalty_spend_unit           = coalesce((p_patch->>'loyalty_spend_unit')::numeric, loyalty_spend_unit),
    cancellation_policy          = coalesce(p_patch->>'cancellation_policy', cancellation_policy),
    cancellation_window_minutes  = coalesce((p_patch->>'cancellation_window_minutes')::int, cancellation_window_minutes),
    cancellation_reason_required = coalesce((p_patch->>'cancellation_reason_required')::boolean, cancellation_reason_required),
    updated_at = now()
  where id;
end; $$;
