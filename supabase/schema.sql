-- =============================================================================
-- CAFINITY — Cafe Management and Ordering System
-- Supabase / PostgreSQL schema  (SRS §7 + loyalty/inventory extensions)
-- Run this in the Supabase SQL Editor on a fresh project, then run seed.sql.
-- =============================================================================

-- Required extensions ---------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =============================================================================
-- ENUM TYPES
-- =============================================================================
do $$ begin
  create type user_role as enum ('customer', 'staff', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_type as enum ('fixed', 'percent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type loyalty_txn_type as enum ('earn', 'redeem', 'bonus', 'adjust');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- users : 1-1 with auth.users (Supabase Auth) -------------------------------
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role   not null default 'customer',
  first_name    text        not null default '',
  last_name     text        not null default '',
  email         text        not null default '',
  -- loyalty
  loyalty_points integer    not null default 0,
  current_streak integer    not null default 0,
  last_order_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- branches --------------------------------------------------------------------
create table if not exists public.branches (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  address       text        not null default '',
  latitude      decimal(9,6),
  longitude     decimal(9,6),
  opening_time  time        not null default '07:00',
  closing_time  time        not null default '22:00',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- product_categories ----------------------------------------------------------
create table if not exists public.product_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  display_order integer     not null default 0
);

-- products --------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid references public.product_categories(id) on delete set null,
  name          text        not null,
  description   text        not null default '',
  image_url     text,
  is_available  boolean     not null default true,
  is_featured   boolean     not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- product_variants ------------------------------------------------------------
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  name          text        not null,
  price         decimal(10,2) not null default 0,
  is_default    boolean     not null default false,
  is_available  boolean     not null default true,
  deleted_at    timestamptz
);

-- customization_groups --------------------------------------------------------
create table if not exists public.customization_groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  selection_type text not null default 'single'
                 check (selection_type in ('single', 'multiple'))
);

-- customization_options -------------------------------------------------------
create table if not exists public.customization_options (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.customization_groups(id) on delete cascade,
  name             text not null,
  additional_price decimal(10,2) not null default 0,
  is_default       boolean not null default false,
  display_order    integer not null default 0
);

-- product_customization_link  (M:N products <-> customization_groups) --------
create table if not exists public.product_customization_link (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id   uuid not null references public.customization_groups(id) on delete cascade,
  primary key (product_id, group_id)
);

-- branch_inventory : per-branch stock (drives menu availability) -------------
-- (Extension beyond §7 to support "menu based on real-time branch inventory",
--  auto-disable of out-of-stock items, and low-stock alerts.)
create table if not exists public.branch_inventory (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches(id) on delete cascade,
  product_variant_id  uuid not null references public.product_variants(id) on delete cascade,
  stock_quantity      integer not null default 0,
  low_stock_threshold integer not null default 10,
  is_available        boolean not null default true,
  updated_at          timestamptz not null default now(),
  unique (branch_id, product_variant_id)
);

-- promotions ------------------------------------------------------------------
create table if not exists public.promotions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  description      text not null default '',
  discount_type    discount_type not null,
  discount_value   decimal(10,2) not null default 0,
  min_order_amount decimal(10,2) not null default 0,
  usage_limit      integer,                 -- null = unlimited
  usage_count      integer not null default 0,
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- orders ----------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  branch_id       uuid not null references public.branches(id),
  order_number    text unique,
  status          order_status   not null default 'pending',
  subtotal        decimal(10,2)  not null default 0,
  discount_amount decimal(10,2)  not null default 0,
  total_amount    decimal(10,2)  not null default 0,
  promo_code      text,
  payment_status  payment_status not null default 'pending',
  payment_method  text           not null default 'GCash',
  paid_at         timestamptz,
  notes           text           not null default '',
  points_earned   integer        not null default 0,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now()
);

-- order_items -----------------------------------------------------------------
create table if not exists public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id),
  product_name       text not null default '',  -- snapshot
  variant_name       text not null default '',  -- snapshot
  quantity           integer not null default 1,
  unit_price         decimal(10,2) not null default 0,
  subtotal           decimal(10,2) not null default 0
);

-- order_item_customization ----------------------------------------------------
create table if not exists public.order_item_customization (
  id                      uuid primary key default gen_random_uuid(),
  order_item_id           uuid not null references public.order_items(id) on delete cascade,
  customization_option_id uuid references public.customization_options(id),
  option_name             text not null default '',  -- snapshot
  quantity                integer not null default 1,
  additional_price        decimal(10,2) not null default 0
);

-- rewards : catalog of redeemable rewards ------------------------------------
create table if not exists public.rewards (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  points_cost   integer not null default 0,
  discount_type discount_type not null default 'fixed',
  discount_value decimal(10,2) not null default 0,
  image_url     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- reward_redemptions ----------------------------------------------------------
create table if not exists public.reward_redemptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  reward_id     uuid not null references public.rewards(id),
  reward_name   text not null default '',
  points_spent  integer not null default 0,
  code          text not null,
  is_used       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- loyalty_transactions : points ledger --------------------------------------
create table if not exists public.loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  points      integer not null default 0,  -- positive earn, negative redeem
  type        loyalty_txn_type not null default 'earn',
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- feedback : ratings after an order (FR: rate beverages & give feedback) ------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text not null default '',
  created_at  timestamptz not null default now(),
  unique (order_id, user_id)
);

-- Helpful indexes -------------------------------------------------------------
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_options_group on public.customization_options(group_id);
create index if not exists idx_inventory_branch on public.branch_inventory(branch_id);
create index if not exists idx_orders_user on public.orders(user_id);
create index if not exists idx_orders_branch_status on public.orders(branch_id, status);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_loyalty_user on public.loyalty_transactions(user_id);

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

-- generic updated_at touch ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- human-readable order_number  (CF-YYMMDD-XXXX) ------------------------------
create or replace function public.set_order_number()
returns trigger language plpgsql as $$
declare
  seq int;
begin
  if new.order_number is null then
    select count(*) + 1 into seq
      from public.orders
      where created_at::date = current_date;
    new.order_number := 'CF-' || to_char(now(), 'YYMMDD') || '-' ||
                        lpad(seq::text, 4, '0');
  end if;
  return new;
end; $$;

drop trigger if exists trg_orders_number on public.orders;
create trigger trg_orders_number before insert on public.orders
  for each row execute function public.set_order_number();

-- create public.users row when a new auth user signs up ----------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, first_name, last_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RPC: place_order  — atomic checkout
--   p_items: jsonb array of
--     { "product_variant_id": uuid, "quantity": int,
--       "customizations": [ { "customization_option_id": uuid, "quantity": int } ] }
--   Validates stock, snapshots prices, applies promo, decrements inventory,
--   awards loyalty points, updates streak — all in one transaction.
-- =============================================================================
create or replace function public.place_order(
  p_branch_id      uuid,
  p_payment_method text,
  p_promo_code     text,
  p_notes          text,
  p_items          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_order       public.orders%rowtype;
  v_item        jsonb;
  v_cust        jsonb;
  v_variant     public.product_variants%rowtype;
  v_product     public.products%rowtype;
  v_inv         public.branch_inventory%rowtype;
  v_qty         int;
  v_line_unit   decimal(10,2);
  v_line_sub    decimal(10,2);
  v_subtotal    decimal(10,2) := 0;
  v_discount    decimal(10,2) := 0;
  v_total       decimal(10,2) := 0;
  v_promo       public.promotions%rowtype;
  v_order_item  public.order_items%rowtype;
  v_opt         public.customization_options%rowtype;
  v_points      int := 0;
  v_streak      int := 1;
  v_last_date   date;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- Create the order shell (totals filled after lines computed) --------------
  insert into public.orders (user_id, branch_id, payment_method, notes, status,
                             payment_status)
  values (v_user, p_branch_id, coalesce(p_payment_method, 'GCash'),
          coalesce(p_notes, ''), 'pending', 'pending')
  returning * into v_order;

  -- Lines --------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    select * into v_variant from public.product_variants
      where id = (v_item->>'product_variant_id')::uuid;
    if not found then
      raise exception 'Variant % not found', v_item->>'product_variant_id';
    end if;
    select * into v_product from public.products where id = v_variant.product_id;

    -- stock check / decrement (only if inventory is tracked for this branch) --
    select * into v_inv from public.branch_inventory
      where branch_id = p_branch_id and product_variant_id = v_variant.id
      for update;
    if found then
      if v_inv.is_available = false or v_inv.stock_quantity < v_qty then
        raise exception 'Insufficient stock for %', v_product.name;
      end if;
      update public.branch_inventory
        set stock_quantity = stock_quantity - v_qty,
            is_available = (stock_quantity - v_qty) > 0,
            updated_at = now()
        where id = v_inv.id;
    end if;

    v_line_unit := v_variant.price;

    insert into public.order_items (order_id, product_variant_id, product_name,
                                    variant_name, quantity, unit_price, subtotal)
    values (v_order.id, v_variant.id, v_product.name, v_variant.name,
            v_qty, v_line_unit, 0)
    returning * into v_order_item;

    -- customizations -----------------------------------------------------------
    if v_item ? 'customizations' then
      for v_cust in select * from jsonb_array_elements(v_item->'customizations')
      loop
        select * into v_opt from public.customization_options
          where id = (v_cust->>'customization_option_id')::uuid;
        if found then
          insert into public.order_item_customization
            (order_item_id, customization_option_id, option_name, quantity,
             additional_price)
          values (v_order_item.id, v_opt.id, v_opt.name,
                  greatest(1, coalesce((v_cust->>'quantity')::int, 1)),
                  v_opt.additional_price);
          v_line_unit := v_line_unit + v_opt.additional_price *
                         greatest(1, coalesce((v_cust->>'quantity')::int, 1));
        end if;
      end loop;
    end if;

    v_line_sub := v_line_unit * v_qty;
    update public.order_items
      set unit_price = v_line_unit, subtotal = v_line_sub
      where id = v_order_item.id;

    v_subtotal := v_subtotal + v_line_sub;
  end loop;

  -- promo --------------------------------------------------------------------
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from public.promotions
      where upper(code) = upper(trim(p_promo_code))
        and is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (usage_limit is null or usage_count < usage_limit)
      for update;
    if found and v_subtotal >= v_promo.min_order_amount then
      if v_promo.discount_type = 'percent' then
        v_discount := round(v_subtotal * v_promo.discount_value / 100.0, 2);
      else
        v_discount := least(v_promo.discount_value, v_subtotal);
      end if;
      update public.promotions set usage_count = usage_count + 1
        where id = v_promo.id;
    else
      raise exception 'Promo code not valid for this order';
    end if;
  end if;

  v_total := greatest(0, v_subtotal - v_discount);

  -- loyalty: 1 point per ₱1 spent (on the charged total) ---------------------
  v_points := floor(v_total)::int;

  -- streak ----------------------------------------------------------------------
  select last_order_date into v_last_date from public.users where id = v_user;
  if v_last_date = current_date then
    select current_streak into v_streak from public.users where id = v_user;
  elsif v_last_date = current_date - 1 then
    select current_streak + 1 into v_streak from public.users where id = v_user;
  else
    v_streak := 1;
  end if;

  -- milestone bonus: every 5th day streak grants +50 -------------------------
  if v_streak > 0 and v_streak % 5 = 0 then
    v_points := v_points + 50;
  end if;

  -- finalize order -----------------------------------------------------------
  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount,
        total_amount = v_total,
        promo_code = nullif(trim(coalesce(p_promo_code, '')), ''),
        payment_status = 'paid',
        paid_at = now(),
        points_earned = v_points,
        status = 'pending'
    where id = v_order.id
    returning * into v_order;

  -- apply loyalty ------------------------------------------------------------
  update public.users
    set loyalty_points = loyalty_points + v_points,
        current_streak = v_streak,
        last_order_date = current_date
    where id = v_user;

  insert into public.loyalty_transactions (user_id, order_id, points, type, description)
  values (v_user, v_order.id, floor(v_total)::int, 'earn',
          'Points earned from order ' || v_order.order_number);

  if v_streak > 0 and v_streak % 5 = 0 then
    insert into public.loyalty_transactions (user_id, order_id, points, type, description)
    values (v_user, v_order.id, 50, 'bonus',
            v_streak || '-day streak bonus');
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'points_earned', v_points,
    'current_streak', v_streak
  );
end; $$;

-- =============================================================================
-- RPC: redeem_reward — spend points for a reward
-- =============================================================================
create or replace function public.redeem_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_reward public.rewards%rowtype;
  v_points int;
  v_code   text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_reward from public.rewards
    where id = p_reward_id and is_active = true;
  if not found then raise exception 'Reward not available'; end if;

  select loyalty_points into v_points from public.users where id = v_user;
  if v_points < v_reward.points_cost then
    raise exception 'Not enough points';
  end if;

  v_code := 'RWD-' || upper(substring(replace(gen_random_uuid()::text, '-', '') for 8));

  update public.users set loyalty_points = loyalty_points - v_reward.points_cost
    where id = v_user;

  insert into public.reward_redemptions
    (user_id, reward_id, reward_name, points_spent, code)
  values (v_user, v_reward.id, v_reward.name, v_reward.points_cost, v_code);

  insert into public.loyalty_transactions (user_id, points, type, description)
  values (v_user, -v_reward.points_cost, 'redeem', 'Redeemed: ' || v_reward.name);

  return jsonb_build_object('code', v_code, 'reward_name', v_reward.name,
                            'points_spent', v_reward.points_cost);
end; $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.users                    enable row level security;
alter table public.branches                 enable row level security;
alter table public.product_categories       enable row level security;
alter table public.products                  enable row level security;
alter table public.product_variants          enable row level security;
alter table public.customization_groups      enable row level security;
alter table public.customization_options     enable row level security;
alter table public.product_customization_link enable row level security;
alter table public.branch_inventory          enable row level security;
alter table public.promotions                enable row level security;
alter table public.orders                    enable row level security;
alter table public.order_items               enable row level security;
alter table public.order_item_customization  enable row level security;
alter table public.rewards                   enable row level security;
alter table public.reward_redemptions        enable row level security;
alter table public.loyalty_transactions      enable row level security;
alter table public.feedback                  enable row level security;

-- helper: is the current user an admin? -------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- users: read/update own row -------------------------------------------------
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- public catalog: readable by any authenticated user -------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches','product_categories','products','product_variants',
    'customization_groups','customization_options','product_customization_link',
    'branch_inventory','promotions','rewards'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t||'_read', t);
  end loop;
end $$;

-- orders: customer reads/creates own; staff & admin read all -----------------
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists orders_update_own on public.orders;
create policy orders_update_own on public.orders
  for update using (auth.uid() = user_id or public.is_admin());

-- order_items / customizations: visible if the parent order is the user's ----
drop policy if exists order_items_rw on public.order_items;
create policy order_items_rw on public.order_items
  for all using (exists (select 1 from public.orders o
                         where o.id = order_id
                           and (o.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.orders o
                      where o.id = order_id and o.user_id = auth.uid()));

drop policy if exists order_item_cust_rw on public.order_item_customization;
create policy order_item_cust_rw on public.order_item_customization
  for all using (exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and (o.user_id = auth.uid() or public.is_admin())))
  with check (exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and o.user_id = auth.uid()));

-- loyalty / redemptions / feedback: own rows --------------------------------
drop policy if exists loyalty_select_own on public.loyalty_transactions;
create policy loyalty_select_own on public.loyalty_transactions
  for select using (auth.uid() = user_id);

drop policy if exists redemptions_select_own on public.reward_redemptions;
create policy redemptions_select_own on public.reward_redemptions
  for select using (auth.uid() = user_id);

drop policy if exists feedback_rw_own on public.feedback;
create policy feedback_rw_own on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: broadcast order status changes to clients ------------------------
alter publication supabase_realtime add table public.orders;

-- =============================================================================
-- DONE.  Next: run seed.sql
-- =============================================================================
