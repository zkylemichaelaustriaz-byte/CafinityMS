-- ============================================================================
-- Phase 17 — Seasonal product visibility (active-campaign gating)
-- Run AFTER phase16_blueberry_rain.sql. Idempotent (safe to re-run).
--
-- Rule: a product is SEASONAL iff it belongs to a collection (collection_key).
-- Seasonal products may only be ordered while their collection is the active
-- seasonal campaign. Permanent products (incl. Matcha Latte + Caramel Macchiato,
-- which phase15 mistakenly tagged) are always orderable.
-- Enforced server-side by a BEFORE INSERT trigger on order_items so the frontend
-- filter can never be the only gate. Historical orders are NOT affected.
-- ============================================================================

-- 1. Normalize the seasonal flags -------------------------------------------
-- Named permanents that were wrongly given a collection_key in phase15.
update public.products
  set collection_key = null, is_seasonal = false
where name in ('Matcha Latte', 'Caramel Macchiato');

-- Canonical rule: seasonal == has a collection_key.
update public.products set is_seasonal = true
  where collection_key is not null and is_seasonal is distinct from true;
update public.products set is_seasonal = false
  where collection_key is null and is_seasonal is distinct from false;

-- 2. Active seasonal collection (server source of truth) ---------------------
-- The active campaign's preset_key, but ONLY when it is a real seasonal
-- collection (not the generic 'default'). NOT frequency-gated (unlike the ad's
-- get_active_campaign): theming + product visibility must be stable per user.
create or replace function public.active_seasonal_collection()
returns text
language sql stable security definer set search_path = public as $$
  select cc.preset_key
  from public.campaigns cc
  where cc.is_active
    and (cc.starts_at is null or cc.starts_at <= now())
    and (cc.ends_at is null or cc.ends_at >= now())
    and cc.preset_key is not null
    and cc.preset_key <> 'default'
  order by cc.priority desc, cc.created_at desc
  limit 1;
$$;

grant execute on function public.active_seasonal_collection() to anon, authenticated;

-- 3. Server-side enforcement at order placement ------------------------------
-- order_items are only inserted by place_order, so this gate rejects any
-- attempt to buy a seasonal product whose campaign is not currently active.
create or replace function public.enforce_seasonal_availability()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_seasonal boolean;
  v_coll text;
  v_name text;
  v_active text;
begin
  select p.is_seasonal, p.collection_key, p.name
    into v_is_seasonal, v_coll, v_name
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = new.product_variant_id;

  if coalesce(v_is_seasonal, false) then
    v_active := public.active_seasonal_collection();
    if v_active is null or v_coll is distinct from v_active then
      raise exception 'SEASONAL_UNAVAILABLE: % is not available under the current campaign',
        coalesce(v_name, 'This seasonal item')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_enforce_seasonal_availability on public.order_items;
create trigger trg_enforce_seasonal_availability
  before insert on public.order_items
  for each row execute function public.enforce_seasonal_availability();

-- =============================================================================
-- DONE. SQL order: … → phase16_blueberry_rain.sql → phase17_seasonal_visibility.sql
-- =============================================================================
