# ☕ Cafinity — Cafe Management and Ordering System

A mobile-based cafe ordering app built for **CSS152P / Software Engineering 2** (Group 3),
implementing the *Cafinity Management and Ordering System* SRS (client: Tomoro Coffee).

This build covers the **end-to-end customer flow**: register/login → branch selection
(geolocation) → inventory-aware menu → drink customization → cart → simulated checkout
(GCash/Cash) → digital order ticket → real-time order tracking → loyalty points & rewards.

It also includes the **staff** order queue and a full **admin** dashboard (sales reports,
inventory, menu management, user roles) — all gated by role-based access control.

---

## 🧰 Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React Native (Expo SDK 54) + TypeScript |
| Routing | Expo Router (file-based) |
| Styling | **Tailwind CSS** via NativeWind |
| State | Zustand (persisted with AsyncStorage) |
| Backend | **Supabase** (PostgreSQL, Auth, Row Level Security, Realtime, RPC) |
| Location | expo-location |
| Notifications | expo-notifications (local) |

---

## ✅ Prerequisites

1. **Node.js 20+** and npm (developed on Node 24).
2. The **Expo Go** app on your phone (iOS App Store / Google Play).
   > This project targets **Expo SDK 54** to match the Expo Go version on the team's
   > devices. If Expo Go says the project is incompatible, install the Expo Go build
   > that supports SDK 54.
3. A free **Supabase** account → <https://supabase.com>.

---

## 🚀 Setup (do this once)

### 1. Install dependencies

```bash
cd Cafinity
npm install
```

### 2. Create the Supabase backend

1. Go to <https://supabase.com/dashboard> → **New project** (pick any name/region; remember
   the database password).
2. Open the project → **SQL Editor** → **New query**.
3. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
4. New query again → paste [`supabase/seed.sql`](supabase/seed.sql) and **Run**
   (loads branches, menu, customizations, promos, and rewards).
5. New query again → paste [`supabase/phase2.sql`](supabase/phase2.sql) and **Run**
   (staff/admin permissions, the role-assignment function, and reporting access).
6. New query again → paste [`supabase/phase3_hardening.sql`](supabase/phase3_hardening.sql)
   and **Run** (security hardening: idempotent checkout, controlled order RPCs, strict
   validation, closed-by-default inventory). Safe to re-run; backfills inventory.
7. **Turn off email confirmation** so sign-up logs you in immediately:
   **Authentication → Sign In / Providers → Email →** disable *“Confirm email”* → Save.
   *(If you leave it on, you must confirm via email before signing in.)*

### 3. Add your credentials

In the Supabase dashboard: **Project Settings → Data API** for the **Project URL**, and
**Project Settings → API Keys** for the **anon / public** key.

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

### 4. Run the app

```bash
npx expo start
```

Scan the QR code with **Expo Go** (Android: in the Expo Go app; iOS: with the Camera app).
Create an account, allow location, pick a branch, and order!

> If you change `.env`, restart with `npx expo start -c` to clear the cache.

### 5. Staff & admin accounts

Everyone signs up as a **customer**. To reach the management side, promote an account in the
Supabase **SQL Editor**:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
update public.users set role = 'staff' where email = 'barista@example.com';
```

Sign out and back in — the app routes **staff → order queue**, **admin → dashboard**, and
**customers → the ordering tabs** automatically.

---

## 📱 Feature walkthrough (maps to the SRS)

| SRS area | Where to see it |
| --- | --- |
| Register / login (Supabase Auth) | `(auth)/login`, `(auth)/register` |
| Branch selection by location (FR-01) | Home → branch card → **Choose a branch** (sorted nearest-first) |
| Inventory-aware menu, auto-disable out-of-stock (FR-02, TC-02) | **Menu** tab — *Hot Chocolate* is sold out at *Cafinity Intramuros* |
| Drink customization + live price (FR-03, TC-03) | Tap any drink → size, sugar, milk, add-ons |
| Cart & total calculation | **Cart** (floating bar on the menu) |
| Checkout, payment method, promo (FR-04) | **Checkout** — try promo `WELCOME10`, `CAFINITY50`, `STUDENT15` |
| Insufficient funds handling (FR-07, TC-06) | Checkout → set the *Simulated GCash balance* below the total |
| Digital order ticket (FR-05) | Order confirmation screen with `CF-YYMMDD-XXXX` number |
| Real-time order tracking | **Order details** — status timeline + live updates + local notification |
| Loyalty points after purchase (FR-06, TC-05) | **Rewards** tab — 1 pt per ₱1, daily streak bonus |
| Rewards redemption | **Rewards** → Redeem → voucher code |
| Rate / feedback after completion | Order details → mark **Completed** → star rating |
| Order atomicity / no double-charge (NFR-01, TC-07) | All checkout logic runs in one `place_order` Postgres transaction |
| Input limits (NFR-02, TC-08) | Quantity is capped at 20 per line |
| Role-based access (Customer/Staff/Admin) | RLS in `schema.sql` + `phase2.sql`, role-based routing |
| **Staff** order queue (FIFO, realtime) | Sign in as staff → live queue, tap **Start / Ready / Complete** |
| **Admin** sales reports (daily/weekly/monthly) | Admin → **Reports** — revenue, top sellers, ratings |
| **Admin** inventory + low-stock alerts | Admin → **Inventory** — edit stock, toggle visibility |
| **Admin** menu CRUD (items, pricing, sizes) | Admin → **Menu** — add/edit/delete products & variants |
| **Admin** user role management | Admin → **Users** — promote to staff/admin |

> **Roles talk to each other live:** when a barista advances an order in the staff queue,
> the customer's tracking screen updates in real time and fires a local notification — all
> through Supabase Realtime.

---

## 🗂️ Project structure

```
Cafinity/
├─ supabase/
│  ├─ schema.sql     # tables, enums, RLS, triggers, place_order/redeem_reward RPCs
│  ├─ seed.sql       # branches, menu, customizations, promos, rewards
│  └─ phase2.sql     # staff/admin RLS + set_user_role RPC
├─ src/
│  ├─ app/                       # Expo Router routes
│  │  ├─ _layout.tsx             # root: auth init + splash gate
│  │  ├─ index.tsx               # role-based redirect gate
│  │  ├─ (auth)/                 # login, register
│  │  ├─ (app)/                  # role: customer — protected area
│  │  │  ├─ (tabs)/              # home, menu, orders, rewards, profile
│  │  │  ├─ branches · product/[id] · cart · checkout
│  │  │  └─ order/[id].tsx       # tracking + feedback
│  │  ├─ staff/                  # role: staff — realtime FIFO order queue
│  │  └─ admin/                  # role: admin — reports, inventory, menu, users
│  ├─ components/ui/             # Button, Field, Screen, Header, Badge, …
│  ├─ lib/                       # supabase client, api, format, errors, notify
│  ├─ store/                     # zustand: auth, branch, cart
│  ├─ types/models.ts            # domain types
│  └─ constants/theme.ts         # brand palette
├─ tailwind.config.js            # NativeWind/Tailwind theme
└─ .env.example
```

---

## 🔎 Useful commands

```bash
npx expo start          # run the dev server (scan QR with Expo Go)
npx expo start -c       # run with cleared cache (after editing .env)
npx tsc --noEmit        # type-check the whole project
```

---

## ⚠️ Notes & known limitations

- **Payments are simulated.** No real GCash/payment gateway is integrated — checkout models
  a successful/failed e-wallet payment for demonstration, as described in the SRS test plan.
- **Push notifications are local.** Expo Go (SDK 53+) no longer supports remote push, so
  order-status updates fire **local** notifications. A development build would be required
  for true remote push.
- **All three roles are implemented** (Customer, Staff, Admin) with role-based access control
  enforced by Supabase RLS and role-based routing.
- **A UI/UX polish pass is still pending** — the current interface is clean and functional
  but not yet styled for production.
