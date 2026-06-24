-- ============================================================================
-- Phase 4 — Customer favorites
-- Run this in the Supabase SQL editor (or psql) AFTER schema.sql / phase2 / phase3.
-- Idempotent: safe to run more than once.
-- ============================================================================

create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references public.users(id) on delete cascade,
  product_id  uuid not null
                references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists favorites_user_idx on public.favorites(user_id);

alter table public.favorites enable row level security;

-- A user may only see and manage their own favorites.
drop policy if exists favorites_rw_own on public.favorites;
create policy favorites_rw_own on public.favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
