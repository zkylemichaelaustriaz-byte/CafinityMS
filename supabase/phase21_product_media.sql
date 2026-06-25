-- ============================================================================
-- Phase 21 — Hot / Iced / Default product media
-- Run AFTER phase20_pickup_number.sql. Idempotent (safe to re-run).
--
-- Scalable per-presentation product imagery without overloading products.image_url
-- (which stays as the legacy/default fallback). order_items snapshot which
-- presentation was bought so historical orders stay consistent.
-- ============================================================================

create table if not exists public.product_media (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  presentation_key text not null check (presentation_key in ('default', 'hot', 'iced')),
  image_url        text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, presentation_key)
);

alter table public.product_media enable row level security;

drop policy if exists "product_media_read" on public.product_media;
create policy "product_media_read" on public.product_media
  for select using (true);

drop policy if exists "product_media_admin_write" on public.product_media;
create policy "product_media_admin_write" on public.product_media
  for all using (public.is_admin()) with check (public.is_admin());

-- Order-item presentation snapshot (which image the customer actually bought).
alter table public.order_items add column if not exists presentation_key text;
alter table public.order_items add column if not exists image_url_snapshot text;

-- Derive the order item's presentation from its Temperature customization, so a
-- later media replacement never changes a historical order's presentation key.
create or replace function public.set_order_item_presentation()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.option_name) in ('hot', 'iced') then
    update public.order_items
      set presentation_key = lower(new.option_name)
    where id = new.order_item_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_order_item_presentation on public.order_item_customization;
create trigger trg_order_item_presentation
  after insert on public.order_item_customization
  for each row execute function public.set_order_item_presentation();

-- =============================================================================
-- DONE. SQL order: … → phase20_pickup_number.sql → phase21_product_media.sql
-- =============================================================================
