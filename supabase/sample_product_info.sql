-- sample_product_info.sql  (OPTIONAL — verification only)
-- Populates Product Information for ONE product so the in-page section appears.
-- Run AFTER phase33_product_information.sql. Safe, idempotent, reversible.
-- Change 'Spanish Latte' to any product name you actually have.

update public.products
   set long_description = 'A velvety espresso-based latte sweetened with condensed milk for a smooth, caramel-like finish. Pulled fresh and balanced so the coffee still comes through.',
       fun_fact       = 'Café con leche condensada is a Filipino café favourite — the sweetened milk gives it that signature creamy finish.',
       ingredients    = '[{"name":"Espresso"},{"name":"Steamed milk"},{"name":"Condensed milk","note":"sweetener"}]'::jsonb,
       allergens      = array['Contains milk'],
       dietary_tags   = array['Vegetarian'],
       caffeine_mg    = 120,
       info_visible   = true
 where lower(name) = lower('Spanish Latte');

-- Per-size nutrition (demonstration estimates). Robust to any variant naming.
update public.product_variants v
   set serving_size        = coalesce(v.serving_size, v.name),
       calories            = 240,
       carbs_g             = 34,
       sugar_g             = 30,
       protein_g           = 7,
       fat_g               = 6,
       sodium_mg           = 90,
       nutrition_estimated = true
  from public.products p
 where v.product_id = p.id
   and v.deleted_at is null
   and lower(p.name) = lower('Spanish Latte');

-- To remove this sample later:
-- update public.products set long_description=null, fun_fact=null,
--   ingredients='[]'::jsonb, allergens='{}', dietary_tags='{}', caffeine_mg=null
--   where lower(name)=lower('Spanish Latte');
