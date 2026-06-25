-- ============================================================================
-- Phase 19 — Profile avatars (column + RPC + Storage bucket/policies)
-- Run AFTER phase18_product_images_storage.sql. Idempotent (safe to re-run).
--
-- Adds users.avatar_url, a restricted RPC to set it (direct updates to
-- public.users are blocked by phase3), and an `avatars` Storage bucket where a
-- user may only write inside their own {user-id}/ folder. Public-read so the
-- photo renders without signed URLs. Service-role key is NEVER in the app.
-- ============================================================================

alter table public.users add column if not exists avatar_url text;

-- Set / clear the signed-in user's own avatar (mirrors update_my_profile).
create or replace function public.set_my_avatar(p_url text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_url is not null and length(p_url) > 1000 then
    raise exception 'Invalid avatar URL';
  end if;
  update public.users
    set avatar_url = p_url, updated_at = now()
  where id = auth.uid();
end; $$;

grant execute on function public.set_my_avatar(text) to authenticated;

-- Avatars bucket: public read, 5MB cap, image MIME only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Public read.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Owner-only write: the first path segment must be the user's id.
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- DONE. SQL order: … → phase18_product_images_storage.sql → phase19_profile_avatars.sql
-- =============================================================================
