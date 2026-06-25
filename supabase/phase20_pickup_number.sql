-- ============================================================================
-- Phase 20 — Friendly pickup number + queue position
-- Run AFTER phase19_profile_avatars.sql. Idempotent (safe to re-run).
--
-- Keeps the canonical orders.order_number (CF-YYMMDD-####) untouched and adds a
-- short per-branch, per-day pickup number (e.g. #042) generated transactionally
-- by a BEFORE INSERT trigger. Legacy orders keep display_queue_number = NULL and
-- fall back to the canonical reference in the UI.
-- ============================================================================

alter table public.orders add column if not exists display_queue_number integer;
alter table public.orders add column if not exists business_date date;

-- Per-branch, per-business-date counter. Written only by the SECURITY DEFINER
-- trigger below; RLS on with no policies blocks any direct client access.
create table if not exists public.branch_daily_order_counters (
  branch_id     uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  last_number   integer not null default 0,
  primary key (branch_id, business_date)
);
alter table public.branch_daily_order_counters enable row level security;

-- Assign the next pickup number atomically. The ON CONFLICT DO UPDATE locks the
-- single counter row, so concurrent orders never collide within a branch+date.
create or replace function public.assign_pickup_number()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_num integer;
begin
  if new.display_queue_number is not null then
    return new;
  end if;
  v_date := (now() at time zone 'Asia/Manila')::date;
  insert into public.branch_daily_order_counters (branch_id, business_date, last_number)
  values (new.branch_id, v_date, 1)
  on conflict (branch_id, business_date)
  do update set last_number = public.branch_daily_order_counters.last_number + 1
  returning last_number into v_num;
  new.business_date := v_date;
  new.display_queue_number := v_num;
  return new;
end; $$;

drop trigger if exists trg_assign_pickup_number on public.orders;
create trigger trg_assign_pickup_number
  before insert on public.orders
  for each row execute function public.assign_pickup_number();

-- Orders ahead in the active queue. SECURITY DEFINER so a customer can see the
-- queue depth without read access to other customers' orders — returns only a count.
create or replace function public.orders_ahead(p_order_id uuid)
returns integer
language plpgsql security definer stable set search_path = public as $$
declare
  v_branch uuid;
  v_created timestamptz;
  v_status order_status;
  v_count integer;
begin
  select branch_id, created_at, status into v_branch, v_created, v_status
  from public.orders where id = p_order_id;
  if v_branch is null or v_status not in ('pending', 'preparing') then
    return 0;
  end if;
  select count(*) into v_count
  from public.orders o
  where o.branch_id = v_branch
    and o.status in ('pending', 'preparing')
    and o.created_at < v_created;
  return coalesce(v_count, 0);
end; $$;

grant execute on function public.orders_ahead(uuid) to authenticated;

-- =============================================================================
-- DONE. SQL order: … → phase19_profile_avatars.sql → phase20_pickup_number.sql
-- =============================================================================
