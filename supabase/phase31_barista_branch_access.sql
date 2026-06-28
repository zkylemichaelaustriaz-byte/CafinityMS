-- phase31_barista_branch_access.sql
-- Restrict baristas (role = 'staff') to their assigned branch unless an admin
-- explicitly grants all-branch access. Enforced in the DATABASE, not just the UI:
--   * READS  — orders / order_items RLS scoped to the staff member's branch.
--   * WRITES — a BEFORE UPDATE trigger blocks acting on another branch's order
--              (all staff order mutations go through SECURITY DEFINER RPCs that
--               UPDATE orders, so one trigger covers advance/cancel/confirm/eta).
-- Admins are unaffected (full access); customers remain limited by existing RLS.
-- Idempotent. Does NOT edit any prior migration or touch existing data.

-- 1) Explicit all-branch grant (default: a barista is single-branch). --------
alter table public.users
  add column if not exists all_branches_access boolean not null default false;

-- 2) Helpers (SECURITY DEFINER so policies can read users regardless of RLS) --
create or replace function public.my_staff_branch()
returns uuid language sql security definer stable set search_path = public as $$
  select branch_id from public.users where id = auth.uid();
$$;

create or replace function public.staff_has_all_branches()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select all_branches_access from public.users where id = auth.uid()), false);
$$;

-- 3) READ scope: staff see only their branch (or all, if granted). -----------
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (
    auth.uid() = user_id
    or public.is_admin()
    or (
      public.is_staff_or_admin()
      and (public.staff_has_all_branches() or branch_id = public.my_staff_branch())
    )
  );

drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and (
        o.user_id = auth.uid()
        or public.is_admin()
        or (
          public.is_staff_or_admin()
          and (public.staff_has_all_branches() or o.branch_id = public.my_staff_branch())
        )
      )
  ));

drop policy if exists order_item_cust_read on public.order_item_customization;
create policy order_item_cust_read on public.order_item_customization
  for select using (exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id
      and (
        o.user_id = auth.uid()
        or public.is_admin()
        or (
          public.is_staff_or_admin()
          and (public.staff_has_all_branches() or o.branch_id = public.my_staff_branch())
        )
      )
  ));

-- 4) WRITE scope: block staff from mutating another branch's order. ----------
create or replace function public.enforce_staff_branch_on_orders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_branch uuid;
  v_all    boolean;
begin
  select role, branch_id, all_branches_access into v_role, v_branch, v_all
    from public.users where id = auth.uid();
  -- Only constrain baristas. Admins keep full access; customers are already
  -- limited to their own orders by RLS (and have no staff RPCs).
  if v_role = 'staff' and not coalesce(v_all, false) then
    if NEW.branch_id is distinct from v_branch then
      raise exception 'Staff branch access denied' using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_staff_branch on public.orders;
create trigger trg_enforce_staff_branch
  before update on public.orders
  for each row execute function public.enforce_staff_branch_on_orders();

-- 5) Admin control: set a staff member's branch scope. -----------------------
create or replace function public.set_staff_branch_access(
  p_user_id uuid,
  p_branch_id uuid,
  p_all_access boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set branch access' using errcode = '42501';
  end if;
  update public.users
    set branch_id = case when coalesce(p_all_access, false) then null else p_branch_id end,
        all_branches_access = coalesce(p_all_access, false),
        updated_at = now()
    where id = p_user_id;
end;
$$;
revoke all on function public.set_staff_branch_access(uuid, uuid, boolean) from public;
grant execute on function public.set_staff_branch_access(uuid, uuid, boolean) to authenticated;

-- 6) Reports honour all-branch grant for staff (supersedes phase30 bodies). ---
create or replace function public.report_orders(
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   user_role;
  v_branch uuid;
  v_all    boolean;
  v_scope  uuid;
  v_result jsonb;
begin
  select role, branch_id, all_branches_access into v_role, v_branch, v_all
    from public.users where id = auth.uid();

  if v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  if v_role = 'admin' then
    v_scope := p_branch_id;
  elsif v_role = 'staff' then
    if coalesce(v_all, false) then
      v_scope := p_branch_id;                 -- all-access barista: any/all branch
    else
      if v_branch is null then
        raise exception 'NO_BRANCH' using errcode = '42501';
      end if;
      if p_branch_id is not null and p_branch_id <> v_branch then
        raise exception 'FORBIDDEN_BRANCH' using errcode = '42501';
      end if;
      v_scope := v_branch;
    end if;
  else
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_result
  from (
    select
      ord.id, ord.order_number, ord.created_at, ord.scheduled_for, ord.cancelled_at,
      ord.status, ord.payment_status, ord.payment_method, ord.subtotal,
      ord.discount_amount, ord.promo_discount, ord.loyalty_reward_discount,
      ord.statutory_discount, ord.tip_amount, ord.vat_amount, ord.total_amount,
      ord.refund_status, ord.refunded_amount, ord.cancellation_reason,
      ord.branch_id, b.name as branch_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name, 'variant_name', oi.variant_name,
          'quantity', oi.quantity, 'unit_price', oi.unit_price, 'subtotal', oi.subtotal
        )) from public.order_items oi where oi.order_id = ord.id
      ), '[]'::jsonb) as order_items
    from public.orders ord
    join public.branches b on b.id = ord.branch_id
    where ord.created_at >= p_from and ord.created_at < p_to
      and (v_scope is null or ord.branch_id = v_scope)
    order by ord.created_at desc
  ) o;

  return v_result;
end;
$$;

create or replace function public.report_feedback(
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   user_role;
  v_branch uuid;
  v_all    boolean;
  v_scope  uuid;
  v_avg    numeric;
  v_count  integer;
  v_tags   jsonb;
begin
  select role, branch_id, all_branches_access into v_role, v_branch, v_all
    from public.users where id = auth.uid();

  if v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_role = 'admin' then
    v_scope := p_branch_id;
  elsif v_role = 'staff' then
    if coalesce(v_all, false) then
      v_scope := p_branch_id;
    else
      if v_branch is null then
        raise exception 'NO_BRANCH' using errcode = '42501';
      end if;
      if p_branch_id is not null and p_branch_id <> v_branch then
        raise exception 'FORBIDDEN_BRANCH' using errcode = '42501';
      end if;
      v_scope := v_branch;
    end if;
  else
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select round(avg(f.rating)::numeric, 2), count(*)
    into v_avg, v_count
    from public.feedback f
    join public.orders o on o.id = f.order_id
    where f.created_at >= p_from and f.created_at < p_to
      and (v_scope is null or o.branch_id = v_scope);

  select coalesce(jsonb_object_agg(t.tag, t.n), '{}'::jsonb) into v_tags
    from (
      select tag, count(*) as n
      from public.feedback f
      join public.orders o on o.id = f.order_id
      cross join lateral unnest(coalesce(f.tags, '{}')) as tag
      where f.created_at >= p_from and f.created_at < p_to
        and (v_scope is null or o.branch_id = v_scope)
      group by tag
    ) t;

  return jsonb_build_object('avg', coalesce(v_avg, 0), 'count', coalesce(v_count, 0), 'tags', v_tags);
end;
$$;
