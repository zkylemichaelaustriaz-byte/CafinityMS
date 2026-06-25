-- ============================================================================
-- Phase 16 — Blueberry Rain seasonal collection (8th campaign)
-- Run AFTER phase15_seasonal_products.sql. Idempotent (safe to re-run).
-- Does NOT truncate or overwrite existing products.
--
-- Adds an is_seasonal flag (forward-compatible with the seasonal-visibility
-- batch), inserts the three Blueberry Rain products with correct variants,
-- stocks them at every branch, and links only the customization groups each
-- product should expose (the Fizz has no milk; the cheesecake has none).
-- ============================================================================

alter table public.products add column if not exists is_seasonal boolean not null default false;

-- 1. Products (skip any that already exist by name) ---------------------------
insert into public.products (category_id, name, description, is_available, is_featured, collection_key, is_seasonal)
select c.id, x.name, x.descr, true, false, 'blueberry-rain', true
from (values
  ('Non-Coffee', 'Blueberry Cloud Latte',        'Creamy blueberry milk with a smooth cloud-like foam.'),
  ('Non-Coffee', 'Butterfly Pea Blueberry Fizz', 'Sparkling butterfly-pea tea layered with blueberry and bright citrus.'),
  ('Pastries',   'Blueberry Cheesecake',         'Creamy cheesecake finished with blueberry compote and one fresh blueberry.')
) as x(cat, name, descr)
join public.product_categories c on c.name = x.cat
where not exists (select 1 from public.products p where p.name = x.name);

-- Make sure any pre-existing rows carry the seasonal flag + collection.
update public.products
  set collection_key = 'blueberry-rain', is_seasonal = true
where name in ('Blueberry Cloud Latte', 'Butterfly Pea Blueberry Fizz', 'Blueberry Cheesecake');

-- 2. Variants -----------------------------------------------------------------
-- Drinks: Small/Medium/Large at the seasonal price points (140/165/190).
do $$
declare r record;
begin
  for r in
    select id from public.products
    where name in ('Blueberry Cloud Latte', 'Butterfly Pea Blueberry Fizz')
      and not exists (select 1 from public.product_variants v where v.product_id = products.id and v.deleted_at is null)
  loop
    insert into public.product_variants (product_id, name, price, is_default, is_available) values
      (r.id, 'Small (12oz)',  140.00, false, true),
      (r.id, 'Medium (16oz)', 165.00, true,  true),
      (r.id, 'Large (22oz)',  190.00, false, true);
  end loop;
end $$;

-- Pastry: single Regular variant, priced like Cheesecake Slice (145).
insert into public.product_variants (product_id, name, price, is_default, is_available)
select p.id, 'Regular', 145.00, true, true
from public.products p
where p.name = 'Blueberry Cheesecake'
  and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.deleted_at is null);

-- 3. Branch inventory: ensure a row exists at every branch, then stock it ------
insert into public.branch_inventory (branch_id, product_variant_id, stock_quantity, low_stock_threshold, is_available)
select b.id, v.id, 100, 10, true
from public.branches b
cross join public.product_variants v
join public.products p on p.id = v.product_id
where p.collection_key = 'blueberry-rain'
  and not exists (
    select 1 from public.branch_inventory bi
    where bi.branch_id = b.id and bi.product_variant_id = v.id
  );

-- Restock any rows the provision trigger created at 0/unavailable.
update public.branch_inventory bi
  set stock_quantity = 100, low_stock_threshold = 10, is_available = true
from public.product_variants v
join public.products p on p.id = v.product_id
where bi.product_variant_id = v.id
  and p.collection_key = 'blueberry-rain'
  and bi.stock_quantity = 0
  and bi.is_available = false;

-- 4. Customization groups (per-product; pastry gets none) ---------------------
-- Blueberry Cloud Latte: Temperature, Sugar Level, Milk Choice, Add-ons.
insert into public.product_customization_link (product_id, group_id)
select p.id, g.id
from public.products p
cross join public.customization_groups g
where p.name = 'Blueberry Cloud Latte'
  and g.name in ('Temperature', 'Sugar Level', 'Milk Choice', 'Add-ons')
  and not exists (
    select 1 from public.product_customization_link l where l.product_id = p.id and l.group_id = g.id
  );

-- Butterfly Pea Blueberry Fizz: Temperature, Sugar Level, Add-ons (NO milk).
insert into public.product_customization_link (product_id, group_id)
select p.id, g.id
from public.products p
cross join public.customization_groups g
where p.name = 'Butterfly Pea Blueberry Fizz'
  and g.name in ('Temperature', 'Sugar Level', 'Add-ons')
  and not exists (
    select 1 from public.product_customization_link l where l.product_id = p.id and l.group_id = g.id
  );

-- =============================================================================
-- DONE. SQL order: … → phase15_seasonal_products.sql → phase16_blueberry_rain.sql
-- =============================================================================
