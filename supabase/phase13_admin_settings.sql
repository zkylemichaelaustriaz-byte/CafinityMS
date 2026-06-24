-- ============================================================================
-- Phase 13 (Batch: Admin Settings) — configurable settings + audit log
-- Run AFTER phase12_campaigns.sql. Idempotent.
--
-- Surfaces the app_settings config (VAT, service fee, tipping, loyalty rate,
-- cancellation policy) and per-branch ETA to admins, and records every change.
-- ============================================================================

create table if not exists public.app_settings_audit (
  id         uuid primary key default gen_random_uuid(),
  setting    text not null,
  old_value  text,
  new_value  text,
  changed_by uuid references public.users(id),
  changed_at timestamptz not null default now()
);
alter table public.app_settings_audit enable row level security;
drop policy if exists settings_audit_admin_read on public.app_settings_audit;
create policy settings_audit_admin_read on public.app_settings_audit
  for select using (public.is_admin());

-- Update global settings; audit each changed field. -------------------------
create or replace function public.update_app_settings(p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings%rowtype; k text; v_old text; v_new text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into s from public.app_settings where id;

  -- Audit (generic per-key diff against the current row).
  for k in select jsonb_object_keys(p_patch) loop
    v_old := to_jsonb(s) ->> k;
    v_new := p_patch ->> k;
    if v_new is distinct from v_old then
      insert into public.app_settings_audit (setting, old_value, new_value, changed_by)
      values (k, v_old, v_new, auth.uid());
    end if;
  end loop;

  -- Apply (typed; coalesce keeps any field the patch omits).
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
    cancellation_policy          = coalesce(p_patch->>'cancellation_policy', cancellation_policy),
    cancellation_window_minutes  = coalesce((p_patch->>'cancellation_window_minutes')::int, cancellation_window_minutes),
    cancellation_reason_required = coalesce((p_patch->>'cancellation_reason_required')::boolean, cancellation_reason_required),
    updated_at = now()
  where id;
end; $$;

-- Update one branch's ETA configuration. ------------------------------------
create or replace function public.update_branch_eta(p_branch_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.branches set
    eta_enabled           = coalesce((p_patch->>'eta_enabled')::boolean, eta_enabled),
    base_prep_minutes     = coalesce((p_patch->>'base_prep_minutes')::int, base_prep_minutes),
    avg_minutes_per_item  = coalesce((p_patch->>'avg_minutes_per_item')::numeric, avg_minutes_per_item),
    active_staff_capacity = coalesce((p_patch->>'active_staff_capacity')::int, active_staff_capacity),
    max_eta_minutes       = coalesce((p_patch->>'max_eta_minutes')::int, max_eta_minutes)
  where id = p_branch_id;

  insert into public.app_settings_audit (setting, old_value, new_value, changed_by)
  values ('branch_eta:' || p_branch_id::text, null, p_patch::text, auth.uid());
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
