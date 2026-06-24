-- ============================================================================
-- Phase 11 (Batch 5) — In-app notifications + preferences (+ push scaffold)
-- Run AFTER phase10_cancellation.sql. Idempotent.
--
-- Layer A (this migration, fully usable in Expo Go): a notifications table that
-- a trigger populates on order lifecycle changes, with per-user preferences and
-- Realtime so the bell updates live.
-- Layer B (remote push): only a device_tokens table is provided here. Sending
-- remote pushes requires a development build + an Edge Function and is NOT wired
-- into app startup (Expo Go cannot register Android push tokens).
-- ============================================================================

-- 1. Notifications -----------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No client INSERT/DELETE — rows are written by the definer trigger below.

-- Realtime so the bell updates without polling.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

-- 2. Per-user notification preferences ---------------------------------------
create table if not exists public.notification_preferences (
  user_id          uuid primary key references public.users(id) on delete cascade,
  order_updates    boolean not null default true,
  promotions       boolean not null default true,
  rewards          boolean not null default true,
  voucher_expiry   boolean not null default true,
  delivery_updates boolean not null default true,
  updated_at       timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists notif_prefs_rw_own on public.notification_preferences;
create policy notif_prefs_rw_own on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Device tokens (Layer B scaffold; no auto-registration) -------------------
create table if not exists public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null,
  platform   text,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.device_tokens enable row level security;
drop policy if exists device_tokens_rw_own on public.device_tokens;
create policy device_tokens_rw_own on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Order lifecycle -> notifications ----------------------------------------
create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pref boolean; v_num text;
begin
  -- Respect the order_updates preference (default on when no row exists).
  select order_updates into v_pref from public.notification_preferences where user_id = new.user_id;
  if not found then v_pref := true; end if;
  if not v_pref then return new; end if;

  v_num := coalesce(new.order_number, '');

  if TG_OP = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, data)
    values (new.user_id, 'order_placed', 'Order received',
            'We got your order ' || v_num || '.',
            jsonb_build_object('order_id', new.id, 'order_number', new.order_number));
    return new;
  end if;

  -- Status transitions.
  if new.status is distinct from old.status then
    if new.status = 'preparing' then
      insert into public.notifications (user_id, type, title, body, data)
      values (new.user_id, 'order_preparing', 'Your order is being prepared',
              'Order ' || v_num || ' is now being prepared.',
              jsonb_build_object('order_id', new.id, 'order_number', new.order_number));
    elsif new.status = 'ready' then
      insert into public.notifications (user_id, type, title, body, data)
      values (new.user_id, 'order_ready', 'Order ready for pickup',
              'Order ' || v_num || ' is ready! 🎉',
              jsonb_build_object('order_id', new.id, 'order_number', new.order_number));
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, type, title, body, data)
      values (new.user_id, 'order_completed', 'Order completed',
              'Thanks! Order ' || v_num || ' is complete.',
              jsonb_build_object('order_id', new.id, 'order_number', new.order_number));
    elsif new.status = 'cancelled' then
      insert into public.notifications (user_id, type, title, body, data)
      values (new.user_id, 'order_cancelled', 'Order cancelled',
              'Order ' || v_num || ' was cancelled.',
              jsonb_build_object('order_id', new.id, 'order_number', new.order_number));
    end if;
  end if;

  -- Payment confirmed (cash).
  if new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
    insert into public.notifications (user_id, type, title, body, data)
    values (new.user_id, 'payment_confirmed', 'Payment confirmed',
            'Payment received for order ' || v_num || '.',
            jsonb_build_object('order_id', new.id));
  end if;

  -- Refund processed / pending.
  if new.refund_status is distinct from old.refund_status
     and new.refund_status in ('refunded', 'refund_pending') then
    insert into public.notifications (user_id, type, title, body, data)
    values (new.user_id, 'refund_' || new.refund_status,
            case when new.refund_status = 'refunded' then 'Refund processed' else 'Refund ready' end,
            case when new.refund_status = 'refunded'
                 then 'Your refund for order ' || v_num || ' has been processed.'
                 else 'Your cash refund for order ' || v_num || ' is ready at the counter.' end,
            jsonb_build_object('order_id', new.id));
  end if;

  -- PWD/Senior verification result.
  if new.discount_verification is distinct from old.discount_verification
     and new.discount_verification in ('verified', 'rejected') then
    insert into public.notifications (user_id, type, title, body, data)
    values (new.user_id, 'discount_' || new.discount_verification,
            case when new.discount_verification = 'verified' then 'Discount verified' else 'Discount not verified' end,
            case when new.discount_verification = 'verified'
                 then 'Your PWD/Senior discount on order ' || v_num || ' was verified.'
                 else 'Your PWD/Senior discount on order ' || v_num || ' could not be verified; full price applies.' end,
            jsonb_build_object('order_id', new.id));
  end if;

  return new;
end; $$;

drop trigger if exists trg_notify_order_change on public.orders;
create trigger trg_notify_order_change
  after insert or update on public.orders
  for each row execute function public.notify_order_change();

-- =============================================================================
-- DONE.
-- =============================================================================
