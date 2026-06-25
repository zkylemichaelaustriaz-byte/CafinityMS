-- Phase 25 — Loyalty challenges.
-- Run AFTER phase24_staff_ops.sql.
--
-- Progress is computed server-side from the user's real order history (never a
-- client-supplied counter), so it can't be gamed. Claiming awards bonus points
-- exactly once per challenge.

-- 1. Tables ------------------------------------------------------------------
create table if not exists public.challenges (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  title          text not null,
  description    text not null default '',
  challenge_type text not null check (
    challenge_type in ('orders_count', 'spend_total', 'distinct_products')
  ),
  goal           numeric not null check (goal > 0),
  reward_points  int not null default 0,
  icon           text not null default 'trophy-outline',
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.user_challenge_claims (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade default auth.uid(),
  challenge_id   uuid not null references public.challenges(id) on delete cascade,
  awarded_points int not null default 0,
  claimed_at     timestamptz not null default now(),
  unique (user_id, challenge_id)
);

alter table public.challenges enable row level security;
alter table public.user_challenge_claims enable row level security;

drop policy if exists "challenges readable" on public.challenges;
create policy "challenges readable" on public.challenges
  for select using (true);

drop policy if exists "challenges admin write" on public.challenges;
create policy "challenges admin write" on public.challenges
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own challenge claims" on public.user_challenge_claims;
create policy "own challenge claims" on public.user_challenge_claims
  for select using (user_id = auth.uid());

-- 2. Progress (shared by the list + the claim guard). ------------------------
create or replace function public.challenge_progress(p_uid uuid, p_challenge_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.challenges%rowtype;
  v numeric := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if not found then return 0; end if;

  if c.challenge_type = 'orders_count' then
    select count(*) into v
      from public.orders o
      where o.user_id = p_uid and o.status <> 'cancelled'
        and (c.starts_at is null or o.created_at >= c.starts_at)
        and (c.ends_at is null or o.created_at <= c.ends_at);
  elsif c.challenge_type = 'spend_total' then
    select coalesce(sum(o.total_amount), 0) into v
      from public.orders o
      where o.user_id = p_uid and o.status <> 'cancelled'
        and (c.starts_at is null or o.created_at >= c.starts_at)
        and (c.ends_at is null or o.created_at <= c.ends_at);
  elsif c.challenge_type = 'distinct_products' then
    select count(distinct oi.product_name) into v
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = p_uid and o.status <> 'cancelled'
        and (c.starts_at is null or o.created_at >= c.starts_at)
        and (c.ends_at is null or o.created_at <= c.ends_at);
  end if;

  return coalesce(v, 0);
end;
$$;

-- 3. List active challenges with the caller's progress. ----------------------
create or replace function public.get_challenges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'title', c.title,
        'description', c.description,
        'type', c.challenge_type,
        'goal', c.goal,
        'reward_points', c.reward_points,
        'icon', c.icon,
        'ends_at', c.ends_at,
        'progress', public.challenge_progress(v_uid, c.id),
        'claimed', exists (
          select 1 from public.user_challenge_claims cl
          where cl.user_id = v_uid and cl.challenge_id = c.id
        )
      )
      order by c.sort_order, c.title
    ),
    '[]'::jsonb
  )
  into v_result
  from public.challenges c
  where c.is_active
    and (c.starts_at is null or now() >= c.starts_at)
    and (c.ends_at is null or now() <= c.ends_at);

  return v_result;
end;
$$;

-- 4. Claim a completed challenge (awards points once). -----------------------
create or replace function public.claim_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenges%rowtype;
  v_progress numeric;
begin
  if v_uid is null then raise exception 'Not authorized'; end if;

  select * into c from public.challenges where id = p_challenge_id and is_active for update;
  if not found then raise exception 'Challenge not found'; end if;

  if (c.starts_at is not null and now() < c.starts_at)
     or (c.ends_at is not null and now() > c.ends_at) then
    raise exception 'CHALLENGE_INACTIVE';
  end if;

  if exists (
    select 1 from public.user_challenge_claims
    where user_id = v_uid and challenge_id = p_challenge_id
  ) then
    raise exception 'ALREADY_CLAIMED';
  end if;

  v_progress := public.challenge_progress(v_uid, p_challenge_id);
  if v_progress < c.goal then raise exception 'NOT_COMPLETE'; end if;

  insert into public.user_challenge_claims (user_id, challenge_id, awarded_points)
  values (v_uid, p_challenge_id, c.reward_points);

  if c.reward_points > 0 then
    update public.users set loyalty_points = loyalty_points + c.reward_points where id = v_uid;
    insert into public.loyalty_transactions (user_id, order_id, points, type, description)
    values (v_uid, null, c.reward_points, 'earn', 'Challenge reward: ' || c.title);
  end if;

  return jsonb_build_object(
    'awarded', c.reward_points,
    'balance', (select loyalty_points from public.users where id = v_uid)
  );
end;
$$;

grant execute on function public.challenge_progress(uuid, uuid) to authenticated;
grant execute on function public.get_challenges() to authenticated;
grant execute on function public.claim_challenge(uuid) to authenticated;

-- 5. Seed a starter set (idempotent). ----------------------------------------
insert into public.challenges (code, title, description, challenge_type, goal, reward_points, icon, sort_order)
values
  ('first_sip',   'First Sip',           'Place your very first order.',        'orders_count',     1,    20, 'cafe-outline',     1),
  ('regular',     'Cafinity Regular',    'Complete 5 orders.',                  'orders_count',     5,    50, 'repeat-outline',   2),
  ('explorer',    'Menu Explorer',       'Try 5 different drinks.',             'distinct_products', 5,    60, 'compass-outline',  3),
  ('connoisseur', 'Coffee Connoisseur',  'Spend ₱1,000 across your orders.', 'spend_total',    1000,   80, 'wallet-outline',   4)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  challenge_type = excluded.challenge_type,
  goal = excluded.goal,
  reward_points = excluded.reward_points,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;
