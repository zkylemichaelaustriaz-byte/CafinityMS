-- phase30_report_authorization.sql
-- Role-aware report data access for the report generator.
--
-- Admins may pull any branch (or all branches). Staff/baristas are LOCKED to
-- their assigned users.branch_id at the database level — they cannot request
-- another branch or "all branches" by altering parameters, regardless of UI.
-- A barista with no branch assignment gets a clear error and no data.
--
-- SECURITY DEFINER + fixed search_path, granted to authenticated only. These are
-- read-only, scoped, parameterised reports — NOT a general data-export function.
-- Idempotent; touches no existing migration or data.

-- Orders within [p_from, p_to) for the authorised scope, with line items nested.
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
  v_scope  uuid;   -- null = all branches (admin only)
  v_result jsonb;
begin
  select role, branch_id into v_role, v_branch
    from public.users where id = auth.uid();

  if v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  if v_role = 'admin' then
    v_scope := p_branch_id;                 -- null allowed = all branches
  elsif v_role = 'staff' then
    if v_branch is null then
      raise exception 'NO_BRANCH' using errcode = '42501';
    end if;
    if p_branch_id is not null and p_branch_id <> v_branch then
      raise exception 'FORBIDDEN_BRANCH' using errcode = '42501';
    end if;
    v_scope := v_branch;                     -- always locked to own branch
  else
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_result
  from (
    select
      ord.id,
      ord.order_number,
      ord.created_at,
      ord.scheduled_for,
      ord.cancelled_at,
      ord.status,
      ord.payment_status,
      ord.payment_method,
      ord.subtotal,
      ord.discount_amount,
      ord.promo_discount,
      ord.loyalty_reward_discount,
      ord.statutory_discount,
      ord.tip_amount,
      ord.vat_amount,
      ord.total_amount,
      ord.refund_status,
      ord.refunded_amount,
      ord.cancellation_reason,
      ord.branch_id,
      b.name as branch_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'unit_price',   oi.unit_price,
          'subtotal',     oi.subtotal
        ))
        from public.order_items oi where oi.order_id = ord.id
      ), '[]'::jsonb) as order_items
    from public.orders ord
    join public.branches b on b.id = ord.branch_id
    where ord.created_at >= p_from
      and ord.created_at < p_to
      and (v_scope is null or ord.branch_id = v_scope)
    order by ord.created_at desc
  ) o;

  return v_result;
end;
$$;

revoke all on function public.report_orders(timestamptz, timestamptz, uuid) from public;
grant execute on function public.report_orders(timestamptz, timestamptz, uuid) to authenticated;

-- Feedback summary for the authorised scope (same role rules).
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
  v_scope  uuid;
  v_avg    numeric;
  v_count  integer;
  v_tags   jsonb;
begin
  select role, branch_id into v_role, v_branch
    from public.users where id = auth.uid();

  if v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_role = 'admin' then
    v_scope := p_branch_id;
  elsif v_role = 'staff' then
    if v_branch is null then
      raise exception 'NO_BRANCH' using errcode = '42501';
    end if;
    if p_branch_id is not null and p_branch_id <> v_branch then
      raise exception 'FORBIDDEN_BRANCH' using errcode = '42501';
    end if;
    v_scope := v_branch;
  else
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select round(avg(f.rating)::numeric, 2), count(*)
    into v_avg, v_count
    from public.feedback f
    join public.orders o on o.id = f.order_id
    where f.created_at >= p_from
      and f.created_at < p_to
      and (v_scope is null or o.branch_id = v_scope);

  select coalesce(jsonb_object_agg(t.tag, t.n), '{}'::jsonb) into v_tags
    from (
      select tag, count(*) as n
      from public.feedback f
      join public.orders o on o.id = f.order_id
      cross join lateral unnest(coalesce(f.tags, '{}')) as tag
      where f.created_at >= p_from
        and f.created_at < p_to
        and (v_scope is null or o.branch_id = v_scope)
      group by tag
    ) t;

  return jsonb_build_object(
    'avg', coalesce(v_avg, 0),
    'count', coalesce(v_count, 0),
    'tags', v_tags
  );
end;
$$;

revoke all on function public.report_feedback(timestamptz, timestamptz, uuid) from public;
grant execute on function public.report_feedback(timestamptz, timestamptz, uuid) to authenticated;
