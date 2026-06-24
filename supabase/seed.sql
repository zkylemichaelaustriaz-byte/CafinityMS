-- =============================================================================
-- CAFINITY — sample data
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- Safe to re-run: clears catalog tables first.
-- =============================================================================

truncate table
  public.order_item_customization,
  public.order_items,
  public.orders,
  public.branch_inventory,
  public.product_customization_link,
  public.customization_options,
  public.customization_groups,
  public.product_variants,
  public.products,
  public.product_categories,
  public.promotions,
  public.rewards,
  public.branches
  restart identity cascade;

-- BRANCHES (Metro Manila) -----------------------------------------------------
insert into public.branches (name, address, latitude, longitude, opening_time, closing_time, is_active) values
  ('Cafinity Intramuros',  'Muralla St, Intramuros, Manila',          14.590600, 120.981000, '07:00', '22:00', true),
  ('Cafinity Makati CBD',   'Ayala Ave, Makati City',                  14.554700, 121.024400, '06:30', '23:00', true),
  ('Cafinity BGC',          '7th Ave, Bonifacio Global City, Taguig',  14.550900, 121.051300, '07:00', '23:00', true),
  ('Cafinity Quezon City',  'Tomas Morato Ave, Quezon City',           14.676000, 121.043700, '07:00', '22:00', true),
  ('Cafinity Manila Bay',   'Roxas Blvd, Pasay City',                  14.537800, 120.984200, '08:00', '21:00', true);

-- CATEGORIES ------------------------------------------------------------------
insert into public.product_categories (name, display_order) values
  ('Signature Coffee', 1),
  ('Espresso',         2),
  ('Non-Coffee',       3),
  ('Pastries',         4);

-- PRODUCTS --------------------------------------------------------------------
insert into public.products (category_id, name, description, image_url, is_available, is_featured) values
  ((select id from public.product_categories where name='Signature Coffee'),
    'Caramel Macchiato', 'Espresso layered with steamed milk, vanilla and caramel drizzle.',
    'https://placehold.co/600x400/9c6b44/fbf7f2/png?text=Caramel+Macchiato', true, true),
  ((select id from public.product_categories where name='Signature Coffee'),
    'Spanish Latte', 'Smooth espresso with sweetened condensed milk.',
    'https://placehold.co/600x400/9c6b44/fbf7f2/png?text=Spanish+Latte', true, true),
  ((select id from public.product_categories where name='Signature Coffee'),
    'Brown Sugar Latte', 'Espresso and milk swirled with caramelized brown sugar.',
    'https://placehold.co/600x400/9c6b44/fbf7f2/png?text=Brown+Sugar+Latte', true, false),
  ((select id from public.product_categories where name='Espresso'),
    'Americano', 'Rich espresso shots topped with hot water.',
    'https://placehold.co/600x400/6a4430/fbf7f2/png?text=Americano', true, false),
  ((select id from public.product_categories where name='Espresso'),
    'Cappuccino', 'Equal parts espresso, steamed milk and velvety foam.',
    'https://placehold.co/600x400/6a4430/fbf7f2/png?text=Cappuccino', true, true),
  ((select id from public.product_categories where name='Espresso'),
    'Flat White', 'Double ristretto with thin micro-foam milk.',
    'https://placehold.co/600x400/6a4430/fbf7f2/png?text=Flat+White', true, false),
  ((select id from public.product_categories where name='Non-Coffee'),
    'Matcha Latte', 'Stone-ground Japanese matcha with fresh milk.',
    'https://placehold.co/600x400/6b8e5a/fbf7f2/png?text=Matcha+Latte', true, true),
  ((select id from public.product_categories where name='Non-Coffee'),
    'Strawberry Milk', 'Fresh milk blended with real strawberry puree.',
    'https://placehold.co/600x400/c2657a/fbf7f2/png?text=Strawberry+Milk', true, false),
  ((select id from public.product_categories where name='Non-Coffee'),
    'Hot Chocolate', 'Decadent dark chocolate steamed with milk.',
    'https://placehold.co/600x400/58392c/fbf7f2/png?text=Hot+Chocolate', true, false),
  ((select id from public.product_categories where name='Pastries'),
    'Butter Croissant', 'Flaky, buttery French-style croissant.',
    'https://placehold.co/600x400/c8893f/2a1a14/png?text=Croissant', true, false),
  ((select id from public.product_categories where name='Pastries'),
    'Chocolate Muffin', 'Moist double-chocolate muffin.',
    'https://placehold.co/600x400/c8893f/2a1a14/png?text=Choco+Muffin', true, false),
  ((select id from public.product_categories where name='Pastries'),
    'Cheesecake Slice', 'Creamy New York-style cheesecake.',
    'https://placehold.co/600x400/c8893f/2a1a14/png?text=Cheesecake', true, false);

-- VARIANTS (sizes) ------------------------------------------------------------
-- Drinks: Small / Medium / Large ; Pastries: single Regular
do $$
declare
  r record;
begin
  for r in select id, name, category_id from public.products loop
    if r.category_id = (select id from public.product_categories where name='Pastries') then
      insert into public.product_variants (product_id, name, price, is_default, is_available)
      values (r.id, 'Regular', 95.00, true, true);
    else
      insert into public.product_variants (product_id, name, price, is_default, is_available) values
        (r.id, 'Small (12oz)',  130.00, false, true),
        (r.id, 'Medium (16oz)', 155.00, true,  true),
        (r.id, 'Large (22oz)',  180.00, false, true);
    end if;
  end loop;
end $$;

-- Give a couple of pastries their own price points
update public.product_variants set price = 75.00
  where name='Regular' and product_id=(select id from public.products where name='Butter Croissant');
update public.product_variants set price = 85.00
  where name='Regular' and product_id=(select id from public.products where name='Chocolate Muffin');
update public.product_variants set price = 145.00
  where name='Regular' and product_id=(select id from public.products where name='Cheesecake Slice');

-- CUSTOMIZATION GROUPS + OPTIONS ---------------------------------------------
insert into public.customization_groups (name, selection_type) values
  ('Temperature', 'single'),
  ('Sugar Level', 'single'),
  ('Milk Choice', 'single'),
  ('Add-ons',     'multiple');

insert into public.customization_options (group_id, name, additional_price, is_default, display_order) values
  ((select id from public.customization_groups where name='Temperature'), 'Hot',  0, true,  1),
  ((select id from public.customization_groups where name='Temperature'), 'Iced', 0, false, 2),
  ((select id from public.customization_groups where name='Sugar Level'), 'No Sugar',    0, false, 1),
  ((select id from public.customization_groups where name='Sugar Level'), 'Less Sweet',  0, false, 2),
  ((select id from public.customization_groups where name='Sugar Level'), 'Regular',     0, true,  3),
  ((select id from public.customization_groups where name='Sugar Level'), 'Extra Sweet', 0, false, 4),
  ((select id from public.customization_groups where name='Milk Choice'), 'Fresh Milk',  0,  true,  1),
  ((select id from public.customization_groups where name='Milk Choice'), 'Oat Milk',    30, false, 2),
  ((select id from public.customization_groups where name='Milk Choice'), 'Almond Milk', 30, false, 3),
  ((select id from public.customization_groups where name='Milk Choice'), 'Soy Milk',    25, false, 4),
  ((select id from public.customization_groups where name='Add-ons'), 'Extra Espresso Shot', 40, false, 1),
  ((select id from public.customization_groups where name='Add-ons'), 'Whipped Cream',       25, false, 2),
  ((select id from public.customization_groups where name='Add-ons'), 'Caramel Drizzle',     20, false, 3),
  ((select id from public.customization_groups where name='Add-ons'), 'Tapioca Pearls',      25, false, 4);

-- LINK customization groups to all drink products (not pastries) -------------
insert into public.product_customization_link (product_id, group_id)
select p.id, g.id
from public.products p
cross join public.customization_groups g
where p.category_id <> (select id from public.product_categories where name='Pastries');

-- BRANCH INVENTORY: stock every variant in every branch ----------------------
insert into public.branch_inventory (branch_id, product_variant_id, stock_quantity, low_stock_threshold, is_available)
select b.id, v.id, 100, 10, true
from public.branches b
cross join public.product_variants v;

-- Demo: make "Hot Chocolate" out of stock at Cafinity Intramuros (TC-02) -----
update public.branch_inventory
  set stock_quantity = 0, is_available = false
where branch_id = (select id from public.branches where name='Cafinity Intramuros')
  and product_variant_id in (
    select v.id from public.product_variants v
    join public.products p on p.id = v.product_id
    where p.name = 'Hot Chocolate');

-- Demo: low stock on Matcha Latte (Large) at Makati to show low-stock alert ---
update public.branch_inventory
  set stock_quantity = 4
where branch_id = (select id from public.branches where name='Cafinity Makati CBD')
  and product_variant_id in (
    select v.id from public.product_variants v
    join public.products p on p.id = v.product_id
    where p.name = 'Matcha Latte' and v.name = 'Large (22oz)');

-- PROMOTIONS ------------------------------------------------------------------
insert into public.promotions (code, description, discount_type, discount_value, min_order_amount, usage_limit, is_active, ends_at) values
  ('WELCOME10',  '10% off your order',          'percent', 10, 0,   null, true, now() + interval '180 days'),
  ('CAFINITY50', '₱50 off orders over ₱250',     'fixed',   50, 250, null, true, now() + interval '180 days'),
  ('STUDENT15',  '15% off orders over ₱150',     'percent', 15, 150, 500,  true, now() + interval '180 days');

-- REWARDS catalog -------------------------------------------------------------
insert into public.rewards (name, description, points_cost, discount_type, discount_value, is_active) values
  ('Free Espresso Shot', 'Redeem for one complimentary espresso shot.', 100, 'fixed', 40,  true),
  ('₱50 Off Voucher',    'Take ₱50 off your next order.',               250, 'fixed', 50,  true),
  ('₱100 Off Voucher',   'Take ₱100 off your next order.',              450, 'fixed', 100, true),
  ('Free Regular Drink', 'Redeem for any medium signature drink.',      600, 'fixed', 155, true);

-- =============================================================================
-- DONE.  Sign up in the app to create your first customer account.
-- =============================================================================
