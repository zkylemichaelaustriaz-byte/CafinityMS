-- Phase 24 — Staff operations: undo a status change + daily staff stats.
-- Run AFTER phase23_branch_workload.sql.

-- 1. revert_order_status — step an order back ONE stage. ----------------------
-- Safe only for preparing→pending and ready→preparing: neither awards/reverses
-- loyalty points nor touches inventory (those fire only on completion/cancel).
-- Reverting a COMPLETED or CANCELLED order is refused — points/refunds have
-- already settled and must go through the dedicated flows.
create or replace function public.revert_order_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_prev  order_status;
  v_count int;
  v_eta   jsonb;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  case v_order.status
    when 'preparing' then v_prev := 'pending';
    when 'ready'     then v_prev := 'preparing';
    else raise exception 'STATUS_NOT_REVERTIBLE';
  end case;

  update public.orders set status = v_prev where id = p_order_id;

  -- ETA lifecycle mirrors advance_order_status in reverse.
  if v_prev = 'pending' then
    update public.orders
      set estimated_min_minutes = null, estimated_max_minutes = null,
          estimated_ready_at = null, eta_calculated_at = null
      where id = p_order_id;
  elsif v_prev = 'preparing' then
    select coalesce(sum(quantity), 0) into v_count
      from public.order_items where order_id = p_order_id;
    v_eta := public.compute_eta(v_order.branch_id, v_count, p_order_id);
    if (v_eta->>'enabled')::boolean then
      update public.orders
        set estimated_min_minutes = (v_eta->>'min')::int,
            estimated_max_minutes = (v_eta->>'max')::int,
            estimated_ready_at = now() + ((v_eta->>'max') || ' minutes')::interval,
            eta_calculated_at = now()
        where id = p_order_id;
    end if;
  end if;

  return jsonb_build_object('status', v_prev);
end;
$$;

grant execute on function public.revert_order_status(uuid) to authenticated;

-- 2. staff_stats — today's tallies for a branch (or all). ---------------------
-- Aggregate-only (counts + revenue); business day = Asia/Manila, matching the
-- pickup-number reset. Staff/admin only.
create or replace function public.staff_stats(p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_served  int;
  v_total   int;
  v_revenue numeric;
  v_active  int;
  v_ready   int;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;

  select count(*) filter (where status = 'completed'),
         count(*),
         coalesce(sum(total_amount) filter (where status = 'completed'), 0)
    into v_served, v_total, v_revenue
    from public.orders
    where business_date = v_today
      and (p_branch_id is null or branch_id = p_branch_id);

  select count(*) filter (where status in ('pending', 'preparing')),
         count(*) filter (where status = 'ready')
    into v_active, v_ready
    from public.orders
    where status in ('pending', 'preparing', 'ready')
      and (p_branch_id is null or branch_id = p_branch_id);

  return jsonb_build_object(
    'served_today',  coalesce(v_served, 0),
    'orders_today',  coalesce(v_total, 0),
    'revenue_today', coalesce(v_revenue, 0),
    'active_now',    coalesce(v_active, 0),
    'ready_now',     coalesce(v_ready, 0)
  );
end;
$$;

grant execute on function public.staff_stats(uuid) to authenticated;
