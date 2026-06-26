-- Phase 28 — Scheduled (advance) pickup orders.
-- Run AFTER phase27_staff_branch.sql.
--
-- Adds a nullable scheduled_for timestamp (null = immediate, preserving every
-- historical order). place_order is NOT modified (it stays the source of truth
-- for pricing/inventory/points); the schedule is attached right after placement
-- via a small owner-only RPC. Staff queue queries can use the index.

alter table public.orders add column if not exists scheduled_for timestamptz;

create index if not exists idx_orders_scheduled_for
  on public.orders(scheduled_for)
  where scheduled_for is not null;

-- Attach / clear a pickup schedule on a freshly placed (pending) order. Owner
-- only; future time only; immediate logic untouched.
create or replace function public.set_order_schedule(
  p_order_id uuid,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> auth.uid() then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then
    raise exception 'Only a pending order can be scheduled';
  end if;
  if p_scheduled_for is not null and p_scheduled_for <= now() then
    raise exception 'Scheduled time must be in the future';
  end if;
  update public.orders set scheduled_for = p_scheduled_for where id = p_order_id;
end;
$$;

grant execute on function public.set_order_schedule(uuid, timestamptz) to authenticated;
