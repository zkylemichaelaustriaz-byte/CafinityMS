-- ============================================================================
-- Phase 22 — Staff-readable customer name for the preparation ticket
-- Run AFTER phase21_product_media.sql. Idempotent (safe to re-run).
--
-- The users table is own-row SELECT only (customers cannot read each other).
-- Rather than broaden that policy, expose ONLY the customer's display name for a
-- given order to staff/admin via a SECURITY DEFINER RPC (returns name fields,
-- nothing else). No table RLS is weakened.
-- ============================================================================

create or replace function public.staff_order_customer(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_staff_or_admin() then
    return null;
  end if;
  select jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name)
    into v
  from public.orders o
  join public.users u on u.id = o.user_id
  where o.id = p_order_id;
  return v;
end; $$;

grant execute on function public.staff_order_customer(uuid) to authenticated;

-- =============================================================================
-- DONE. SQL order: … → phase21_product_media.sql → phase22_staff_order_customer.sql
-- =============================================================================
