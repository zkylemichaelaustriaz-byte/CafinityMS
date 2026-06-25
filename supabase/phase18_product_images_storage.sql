-- ============================================================================
-- Phase 18 — product-images Storage bucket + policies (admin product builder)
-- Run AFTER phase17_seasonal_visibility.sql. Idempotent (safe to re-run).
--
-- Creates a PUBLIC-read bucket for product photos. Only admins (public.is_admin())
-- may upload / replace / delete. The app uploads with the signed-in user's
-- session — the service-role key is NEVER shipped to the client.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Public read (the bucket is public; this policy makes object reads explicit).
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select
  using (bucket_id = 'product-images');

-- Admin-only insert.
drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

-- Admin-only update (replace).
drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

-- Admin-only delete (cleanup).
drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- =============================================================================
-- DONE. SQL order: … → phase17_seasonal_visibility.sql → phase18_product_images_storage.sql
-- =============================================================================
