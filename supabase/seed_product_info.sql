-- seed_product_info.sql
-- Populates Product Information (About / Ingredients / Allergens & dietary /
-- Nutrition) for ALL current Cafinity products. Keyed by product name, so it
-- only updates products that exist in your database. Idempotent and reversible.
-- Run AFTER phase33_product_information.sql.
--
-- Nutrition values are per-serving DEMONSTRATION ESTIMATES (nutrition_estimated
-- = true) based on the standard recipe; they may change with customizations.

-- 1) Product-level information ----------------------------------------------
with pinfo(name, long_desc, fun, ingredients, allergens, dietary, caffeine) as (values
  ('Caramel Macchiato',
   'Espresso layered over steamed milk and vanilla, finished with a lattice of caramel drizzle. Sweet on top, balanced espresso underneath.',
   'A macchiato means "marked" — the espresso "marks" the milk as it''s poured.',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Vanilla syrup"},{"name":"Caramel","note":"drizzle"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 150::integer),
  ('Spanish Latte',
   'Smooth espresso sweetened with condensed milk for a creamy, caramel-like finish while the coffee still comes through.',
   'Café con leche condensada is a Filipino café favourite for its signature sweetness.',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Condensed milk","note":"sweetener"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 120),
  ('Brown Sugar Latte',
   'Espresso and fresh milk swirled with caramelised brown sugar syrup for a deep, toffee-like sweetness.',
   '',
   '[{"name":"Espresso"},{"name":"Fresh milk"},{"name":"Brown sugar","note":"caramelised syrup"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 130),
  ('Americano',
   'Rich espresso shots lengthened with hot water — a clean, full-flavoured black coffee.',
   'Said to be named for American soldiers in WWII Italy who diluted espresso to taste like drip coffee.',
   '[{"name":"Espresso"},{"name":"Hot water"}]'::jsonb,
   '{}'::text[], array['Vegan','Dairy-free'], 150),
  ('Cappuccino',
   'Equal parts espresso, steamed milk and a thick cap of velvety microfoam.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Milk foam"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 150),
  ('Flat White',
   'A double ristretto under thin, glossy microfoam milk — stronger and silkier than a latte.',
   '',
   '[{"name":"Ristretto espresso"},{"name":"Steamed milk","note":"microfoam"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 130),
  ('Matcha Latte',
   'Stone-ground Japanese matcha whisked with fresh milk for an earthy, lightly sweet green-tea latte.',
   'Ceremonial matcha is shade-grown for weeks before harvest to boost its colour and umami.',
   '[{"name":"Matcha","note":"green tea"},{"name":"Fresh milk"},{"name":"Sugar"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 70),
  ('Strawberry Milk',
   'Fresh milk blended with real strawberry purée — fruity, creamy and caffeine-free.',
   '',
   '[{"name":"Fresh milk"},{"name":"Strawberry purée"},{"name":"Sugar"}]'::jsonb,
   array['Contains milk'], array['Vegetarian','Caffeine-free'], null::integer),
  ('Hot Chocolate',
   'Decadent dark chocolate steamed with milk into a rich, comforting cup.',
   '',
   '[{"name":"Dark chocolate"},{"name":"Steamed milk"},{"name":"Cocoa"}]'::jsonb,
   array['Contains milk','May contain traces of nuts'], array['Vegetarian'], 25),
  ('Butter Croissant',
   'A flaky, golden French-style croissant with buttery, layered pastry.',
   'A good croissant has dozens of paper-thin butter layers created by repeated folding.',
   '[{"name":"Wheat flour"},{"name":"Butter"},{"name":"Yeast"},{"name":"Milk"}]'::jsonb,
   array['Contains gluten','Contains milk','May contain egg'], array['Vegetarian'], null),
  ('Chocolate Muffin',
   'A moist, double-chocolate muffin with melty chocolate chips throughout.',
   '',
   '[{"name":"Wheat flour"},{"name":"Cocoa"},{"name":"Chocolate chips"},{"name":"Egg"},{"name":"Butter"},{"name":"Sugar"}]'::jsonb,
   array['Contains gluten','Contains milk','Contains egg','May contain nuts'], array['Vegetarian'], 10),
  ('Cheesecake Slice',
   'Creamy New York-style cheesecake on a buttery biscuit base.',
   '',
   '[{"name":"Cream cheese"},{"name":"Biscuit base"},{"name":"Egg"},{"name":"Sugar"}]'::jsonb,
   array['Contains gluten','Contains milk','Contains egg'], array['Vegetarian'], null),
  -- Seasonal products (updated only if present in your database) --------------
  ('Caramel Cookie Latte',
   'Espresso and milk with caramel and buttery cookie crumble — a dessert in a cup.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Caramel"},{"name":"Cookie crumble"}]'::jsonb,
   array['Contains milk','Contains gluten','May contain nuts'], array['Vegetarian'], 130),
  ('Peppermint Mocha',
   'Espresso with dark chocolate, steamed milk and a cool hit of peppermint.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Dark chocolate"},{"name":"Peppermint"}]'::jsonb,
   array['Contains milk','May contain traces of nuts'], array['Vegetarian'], 150),
  ('Gingerbread Latte',
   'A cosy espresso latte spiced with warm gingerbread syrup.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Gingerbread syrup","note":"ginger, cinnamon, nutmeg"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 130),
  ('Strawberry Red Velvet Latte',
   'A red-velvet inspired latte with cocoa and sweet strawberry.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Cocoa"},{"name":"Strawberry"}]'::jsonb,
   array['Contains milk','May contain traces of nuts'], array['Vegetarian'], 110),
  ('Choco Strawberry Mocha',
   'Chocolate mocha brightened with strawberry over espresso and milk.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Chocolate"},{"name":"Strawberry"}]'::jsonb,
   array['Contains milk','May contain nuts'], array['Vegetarian'], 140),
  ('Mango Latte',
   'Ripe mango blended with milk for a smooth, fruity drink.',
   '',
   '[{"name":"Mango purée"},{"name":"Fresh milk"},{"name":"Sugar"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], null),
  ('Mango Cream Frappe',
   'Blended mango with milk, cream and ice — thick, frosty and refreshing.',
   '',
   '[{"name":"Mango purée"},{"name":"Fresh milk"},{"name":"Cream"},{"name":"Ice"}]'::jsonb,
   array['Contains milk'], array['Vegetarian','Caffeine-free'], null),
  ('Matcha Strawberry Latte',
   'Earthy matcha layered with sweet strawberry and fresh milk.',
   '',
   '[{"name":"Matcha"},{"name":"Fresh milk"},{"name":"Strawberry"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 70),
  ('Blueberry Cloud Latte',
   'A soft blueberry latte topped with airy cloud foam.',
   '',
   '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Blueberry"},{"name":"Cloud foam"}]'::jsonb,
   array['Contains milk'], array['Vegetarian'], 110)
)
update public.products p
   set long_description = pi.long_desc,
       fun_fact        = nullif(pi.fun, ''),
       ingredients     = pi.ingredients,
       allergens       = pi.allergens,
       dietary_tags    = pi.dietary,
       caffeine_mg     = pi.caffeine,
       info_visible    = true
  from pinfo pi
 where lower(p.name) = lower(pi.name);

-- 2) Per-serving nutrition (estimates) --------------------------------------
-- Base values per product; serving size taken from the variant name. Applies to
-- every active variant of each matched product.
with ninfo(name, cal, carb, sugar, prot, fat, sodium) as (values
  ('Caramel Macchiato', 250, 35, 33, 8, 7, 120),
  ('Spanish Latte',     240, 34, 30, 7, 6, 90),
  ('Brown Sugar Latte', 250, 36, 34, 7, 6, 95),
  ('Americano',          10,  2,  0, 1, 0, 10),
  ('Cappuccino',        120, 12,  9, 7, 5, 90),
  ('Flat White',        140, 13, 10, 8, 6, 95),
  ('Matcha Latte',      190, 27, 24, 7, 6, 95),
  ('Strawberry Milk',   220, 30, 28, 7, 7, 100),
  ('Hot Chocolate',     300, 38, 32, 9, 11, 140),
  ('Butter Croissant',  280, 31,  6, 6, 15, 320),
  ('Chocolate Muffin',  420, 56, 38, 6, 20, 360),
  ('Cheesecake Slice',  350, 30, 26, 6, 23, 250),
  ('Caramel Cookie Latte', 320, 44, 38, 8, 10, 160),
  ('Peppermint Mocha',     330, 45, 36, 9, 11, 150),
  ('Gingerbread Latte',    300, 42, 34, 8, 8, 130),
  ('Strawberry Red Velvet Latte', 340, 47, 40, 8, 10, 150),
  ('Choco Strawberry Mocha',      340, 46, 38, 9, 11, 150),
  ('Mango Latte',          280, 42, 34, 6, 7, 90),
  ('Mango Cream Frappe',   360, 52, 44, 6, 12, 110),
  ('Matcha Strawberry Latte', 260, 38, 30, 7, 7, 95),
  ('Blueberry Cloud Latte',   300, 42, 34, 7, 8, 110)
)
update public.product_variants v
   set serving_size        = coalesce(v.serving_size, v.name),
       calories            = ni.cal,
       carbs_g             = ni.carb,
       sugar_g             = ni.sugar,
       protein_g           = ni.prot,
       fat_g               = ni.fat,
       sodium_mg           = ni.sodium,
       nutrition_estimated = true
  from public.products p
  join ninfo ni on lower(ni.name) = lower(p.name)
 where v.product_id = p.id
   and v.deleted_at is null;

-- Reversal (run to clear everything this script set):
--   update public.products set long_description=null, fun_fact=null,
--     ingredients='[]'::jsonb, allergens='{}', dietary_tags='{}', caffeine_mg=null;
--   update public.product_variants set serving_size=null, calories=null, carbs_g=null,
--     sugar_g=null, protein_g=null, fat_g=null, sodium_mg=null, nutrition_estimated=true;
