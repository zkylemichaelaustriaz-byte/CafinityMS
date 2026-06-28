-- phase33_product_information.sql
-- In-page Product Information: extended description, fun fact, ingredients,
-- allergen/dietary tags (product-level) and nutrition (per variant/serving).
-- Reuses the existing products / product_variants tables and their existing RLS
-- (admin write, public read), so no new policies are required — customers read
-- these columns through the same product queries.
--
-- Idempotent. Does NOT edit any prior migration.

-- Product-level information ---------------------------------------------------
alter table public.products
  add column if not exists long_description text,
  add column if not exists fun_fact        text,
  add column if not exists info_visible     boolean not null default true,
  add column if not exists ingredients      jsonb   not null default '[]'::jsonb,  -- [{ "name": "...", "note": "..." }]
  add column if not exists allergens        text[]  not null default '{}',
  add column if not exists dietary_tags     text[]  not null default '{}',
  add column if not exists caffeine_mg      integer;

-- Per-variant (per-serving) nutrition ----------------------------------------
alter table public.product_variants
  add column if not exists serving_size        text,
  add column if not exists calories            integer,
  add column if not exists carbs_g             numeric(6,1),
  add column if not exists sugar_g             numeric(6,1),
  add column if not exists protein_g           numeric(6,1),
  add column if not exists fat_g               numeric(6,1),
  add column if not exists sodium_mg           integer,
  -- Demonstration values are estimates unless explicitly verified.
  add column if not exists nutrition_estimated boolean not null default true;
