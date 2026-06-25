-- Phase 23 — Branch workload indicator.
-- Run AFTER phase22_staff_order_customer.sql.
--
-- Customers can only see their OWN orders (RLS), so a per-branch busyness
-- reading needs a SECURITY DEFINER aggregate. This function returns ONLY
-- non-identifying counts + a wait estimate (no order rows, no customer data),
-- so it is safe to expose to any authenticated user.

create or replace function public.branch_workload(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active int;
  v_items  int;
  v_eta    jsonb;
  v_level  text;
begin
  -- Active orders still in the kitchen (placed but not yet ready/done/cancelled).
  select count(*) into v_active
    from public.orders o
    where o.branch_id = p_branch_id
      and o.status in ('pending', 'preparing');

  -- Total queued drinks (drives the busyness band more fairly than order count).
  select coalesce(sum(oi.quantity), 0) into v_items
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.branch_id = p_branch_id
      and o.status in ('pending', 'preparing');

  -- Current wait for a new order (0 extra items = "if you ordered now").
  v_eta := public.compute_eta(p_branch_id, 0, null);

  v_level := case
    when v_items <= 3  then 'quiet'
    when v_items <= 10 then 'moderate'
    else 'busy'
  end;

  return jsonb_build_object(
    'active', v_active,
    'queued_items', v_items,
    'level', v_level,
    'eta_enabled', coalesce((v_eta->>'enabled')::boolean, false),
    'wait_min', v_eta->'min',
    'wait_max', v_eta->'max'
  );
end;
$$;

grant execute on function public.branch_workload(uuid) to authenticated;
