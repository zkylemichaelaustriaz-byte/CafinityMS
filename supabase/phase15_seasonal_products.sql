-- ============================================================================
-- Phase 15 — Seasonal products + campaign collection linkage
-- Run AFTER phase14_campaign_presets.sql. Idempotent (safe to re-run).
-- Does NOT truncate or overwrite the existing 12 products.
--
-- Adds products.collection_key (nullable) so campaigns can surface a collection,
-- inserts 10 seasonal drinks with Small/Medium/Large variants, stocks them at
-- every branch, and links the standard customization groups.
-- ============================================================================

alter table public.products add column if not exists collection_key text;

-- 1. Seasonal products (skip any that already exist by name) ------------------
insert into public.products (category_id, name, description, is_available, is_featured, collection_key)
select c.id, x.name, x.descr, true, false, x.coll
from (values
  ('Non-Coffee',       'Mango Latte',                 'Creamy mango blended with fresh milk and a hint of espresso.', 'mango'),
  ('Non-Coffee',       'Mango Cream Frappe',          'Blended mango frappe topped with whipped cream.',             'mango'),
  ('Non-Coffee',       'Matcha Strawberry Latte',     'Stone-ground matcha layered with real strawberry.',           'matcha'),
  ('Signature Coffee', 'Caramel Cookie Latte',        'Buttery caramel and cookie crumble over espresso.',           'caramel'),
  ('Signature Coffee', 'Peppermint Mocha',            'Dark chocolate mocha with cool peppermint.',                  'christmas'),
  ('Signature Coffee', 'Gingerbread Latte',           'Warm gingerbread spice with espresso and milk.',              'christmas'),
  ('Signature Coffee', 'Strawberry Red Velvet Latte', 'Red velvet sweetness with strawberry and espresso.',          'valentines'),
  ('Signature Coffee', 'Choco Strawberry Mocha',      'Chocolate mocha swirled with strawberry.',                    'valentines'),
  ('Non-Coffee',       'Ube Latte',                   'Creamy Filipino ube with fresh milk.',                        'ube-taro'),
  ('Non-Coffee',       'Taro Milk Tea',               'Smooth taro milk tea, naturally sweet.',                      'ube-taro')
) as x(cat, name, descr, coll)
join public.product_categories c on c.name = x.cat
where not exists (select 1 from public.products p where p.name = x.name);

-- 2. Variants for any seasonal product that has none -------------------------
do $$
declare r record;
begin
  for r in
    select p.id from public.products p
    where p.collection_key is not null
      and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.deleted_at is null)
  loop
    insert into public.product_variants (product_id, name, price, is_default, is_available) values
      (r.id, 'Small (12oz)',  140.00, false, true),
      (r.id, 'Medium (16oz)', 165.00, true,  true),
      (r.id, 'Large (22oz)',  190.00, false, true);
  end loop;
end $$;

-- 3. Stock the seasonal variants (the provision trigger created 0/unavailable)
update public.branch_inventory bi
  set stock_quantity = 100, low_stock_threshold = 10, is_available = true
from public.product_variants v
join public.products p on p.id = v.product_id
where bi.product_variant_id = v.id
  and p.collection_key is not null
  and bi.stock_quantity = 0
  and bi.is_available = false;

-- 4. Link standard customization groups to seasonal drinks -------------------
insert into public.product_customization_link (product_id, group_id)
select p.id, g.id
from public.products p
cross join public.customization_groups g
where p.collection_key is not null
  and not exists (
    select 1 from public.product_customization_link l
    where l.product_id = p.id and l.group_id = g.id
  );

-- 5. Tag two existing products into their collections (no overwrite of others)
update public.products set collection_key = 'matcha'  where name = 'Matcha Latte'      and collection_key is null;
update public.products set collection_key = 'caramel' where name = 'Caramel Macchiato' and collection_key is null;

-- =============================================================================
-- DONE.
-- =============================================================================
