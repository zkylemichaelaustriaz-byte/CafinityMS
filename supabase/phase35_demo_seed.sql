-- ============================================================================
-- Phase 35 — demonstration-data batch tag (additive, idempotent, harmless).
-- Run AFTER phase34_flexible_loyalty.sql.
--
-- Adds a nullable text column `demo_batch` to the tables the demo-data seeder
-- writes to. No application code reads this column, so production behaviour is
-- unchanged. Its only purpose is to let scripts/cleanup-demo-data.mjs find and
-- remove ONLY the rows a given seeding batch created — never real data.
--
-- Real rows keep demo_batch = NULL. Seeded rows get e.g. 'demo_v1'.
-- ============================================================================

alter table public.orders                add column if not exists demo_batch text;
alter table public.feedback              add column if not exists demo_batch text;
alter table public.loyalty_transactions  add column if not exists demo_batch text;
alter table public.reward_redemptions    add column if not exists demo_batch text;
alter table public.notifications         add column if not exists demo_batch text;

-- Partial indexes so cleanup/verify queries on the (small) seeded subset are fast
-- without touching the much larger set of real, NULL-tagged rows.
create index if not exists idx_orders_demo_batch
  on public.orders(demo_batch) where demo_batch is not null;
create index if not exists idx_feedback_demo_batch
  on public.feedback(demo_batch) where demo_batch is not null;
create index if not exists idx_loyalty_demo_batch
  on public.loyalty_transactions(demo_batch) where demo_batch is not null;
create index if not exists idx_redemptions_demo_batch
  on public.reward_redemptions(demo_batch) where demo_batch is not null;
create index if not exists idx_notifications_demo_batch
  on public.notifications(demo_batch) where demo_batch is not null;
