-- =============================================================================
-- CAFINITY — Phase 2: Staff & Admin (RBAC)
-- Run this AFTER schema.sql + seed.sql, in the Supabase SQL Editor.
-- Safe to re-run.
-- =============================================================================

-- helper: is the current user staff or admin? --------------------------------
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

-- ORDERS: staff & admin may read and update every order ----------------------
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id or public.is_staff_or_admin());

drop policy if exists orders_update_own on public.orders;
create policy orders_update_own on public.orders
  for update using (auth.uid() = user_id or public.is_staff_or_admin());

-- ORDER ITEMS + CUSTOMIZATIONS: staff & admin may read -----------------------
drop policy if exists order_items_rw on public.order_items;
create policy order_items_rw on public.order_items
  for all
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.user_id = auth.uid() or public.is_staff_or_admin())))
  with check (exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));

drop policy if exists order_item_cust_rw on public.order_item_customization;
create policy order_item_cust_rw on public.order_item_customization
  for all
  using (exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id
      and (o.user_id = auth.uid() or public.is_staff_or_admin())))
  with check (exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and o.user_id = auth.uid()));

-- FEEDBACK: admin may read all (for reports) ---------------------------------
drop policy if exists feedback_admin_read on public.feedback;
create policy feedback_admin_read on public.feedback
  for select using (public.is_admin());

-- CATALOG + INVENTORY: admin gets full write access --------------------------
-- (the existing *_read policies still let any authenticated user read.)
do $$
declare t text;
begin
  foreach t in array array[
    'branches','product_categories','products','product_variants',
    'customization_groups','customization_options','product_customization_link',
    'branch_inventory','promotions','rewards'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t);
  end loop;
end $$;

-- RPC: admins assign roles ---------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  update public.users set role = p_role where id = p_user_id;
end; $$;

-- Make sure realtime is on for staff queue (idempotent) ----------------------
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

-- =============================================================================
-- To create your first staff / admin accounts:
--   1. Sign up normally in the app (creates a 'customer').
--   2. Run, e.g.:
--        update public.users set role = 'admin' where email = 'you@example.com';
--        update public.users set role = 'staff' where email = 'barista@example.com';
--   3. Sign out & back in — the app routes you to the right interface.
-- =============================================================================
