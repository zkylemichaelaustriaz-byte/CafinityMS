-- verify_migrations.sql
-- Read-only verification that the latest required migrations are applied.
-- Run in the Supabase SQL editor. Every row should report ok = true.
-- This script changes NOTHING. Apply migrations in order first:
--   phase28 (scheduled orders) → phase29 (inventory save) → phase30 (reports)
--   → phase31 (barista branch access) → phase32 (notification delete)
--   → phase33 (product information) → phase34 (flexible loyalty)

with checks(phase, item, ok) as (
  values
  -- phase28
  ('28','orders.scheduled_for column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='scheduled_for')),
  -- phase29
  ('29','save_branch_inventory() function',
    exists (select 1 from pg_proc where proname='save_branch_inventory')),
  -- phase30 / 31
  ('30/31','report_orders() function',
    exists (select 1 from pg_proc where proname='report_orders')),
  ('30/31','report_feedback() function',
    exists (select 1 from pg_proc where proname='report_feedback')),
  ('31','users.all_branches_access column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='all_branches_access')),
  ('31','set_staff_branch_access() function',
    exists (select 1 from pg_proc where proname='set_staff_branch_access')),
  ('31','enforce_staff_branch trigger',
    exists (select 1 from pg_trigger where tgname='trg_enforce_staff_branch')),
  ('31','my_staff_branch()/staff_has_all_branches() helpers',
    exists (select 1 from pg_proc where proname='my_staff_branch')
      and exists (select 1 from pg_proc where proname='staff_has_all_branches')),
  -- phase32
  ('32','notifications_delete_own policy',
    exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_delete_own')),
  -- phase33
  ('33','products.long_description column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='long_description')),
  ('33','products.ingredients column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='ingredients')),
  ('33','products.info_visible column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='info_visible')),
  ('33','product_variants.calories column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='calories')),
  ('33','product_variants.nutrition_estimated column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='nutrition_estimated')),
  -- phase34
  ('34','app_settings.loyalty_points_awarded column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='loyalty_points_awarded')),
  ('34','app_settings.loyalty_spend_unit column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='loyalty_spend_unit')),
  ('34','loyalty_points_for() function',
    exists (select 1 from pg_proc where proname='loyalty_points_for'))
)
select phase, item, ok,
       case when ok then '✓' else '✗ MISSING — apply migration' end as status
from checks
order by phase, item;
