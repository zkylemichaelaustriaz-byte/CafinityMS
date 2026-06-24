-- ============================================================================
-- Phase 12 (Batch 6) — Seasonal product campaign announcements
-- Run AFTER phase11_notifications.sql. Idempotent.
--
-- Admin-controlled, dismissible, frequency-capped promo modal with impression
-- tracking. (This is the campaign AD, separate from the seasonal THEME editor,
-- which stays deferred until Light/Dark is confirmed on-device.)
-- ============================================================================

create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  subtitle            text not null default '',
  product_id          uuid references public.products(id) on delete set null,
  hero_image_url      text,
  dark_hero_image_url text,
  badge               text,
  cta_label           text not null default 'View',
  starts_at           timestamptz,
  ends_at             timestamptz,
  priority            int  not null default 0,
  frequency_rule      text not null default 'once',  -- once | once_per_day | always
  is_active           boolean not null default true,
  theme_id            uuid,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now()
);

do $$ begin
  alter table public.campaigns add constraint campaigns_frequency_chk
    check (frequency_rule in ('once','once_per_day','always'));
exception when duplicate_object then null; end $$;

alter table public.campaigns enable row level security;
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select using (true);
drop policy if exists campaigns_admin_write on public.campaigns;
create policy campaigns_admin_write on public.campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.campaign_impressions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.users(id) on delete cascade,
  viewed_at    timestamptz not null default now(),
  dismissed_at timestamptz,
  clicked_at   timestamptz
);
create index if not exists campaign_impressions_idx
  on public.campaign_impressions(campaign_id, user_id);

alter table public.campaign_impressions enable row level security;
drop policy if exists campaign_impressions_rw_own on public.campaign_impressions;
create policy campaign_impressions_rw_own on public.campaign_impressions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Highest-priority active campaign this user is still eligible to see.
create or replace function public.get_active_campaign()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.campaigns%rowtype;
begin
  if v_uid is null then return null; end if;
  select * into c from public.campaigns cc
  where cc.is_active
    and (cc.starts_at is null or cc.starts_at <= now())
    and (cc.ends_at is null or cc.ends_at >= now())
    and (
      cc.frequency_rule = 'always'
      or (cc.frequency_rule = 'once' and not exists (
            select 1 from public.campaign_impressions i
            where i.campaign_id = cc.id and i.user_id = v_uid))
      or (cc.frequency_rule = 'once_per_day' and not exists (
            select 1 from public.campaign_impressions i
            where i.campaign_id = cc.id and i.user_id = v_uid and i.viewed_at::date = current_date))
    )
  order by cc.priority desc, cc.created_at desc
  limit 1;
  if not found then return null; end if;
  return to_jsonb(c);
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
