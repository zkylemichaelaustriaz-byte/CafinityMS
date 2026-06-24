# Cafinity Management and Ordering System — Implementation Documentation

| | |
| --- | --- |
| **Project** | Cafinity Management and Ordering System |
| **Client** | Tomoro Coffee |
| **Course** | CSS152P / Software Engineering 2 |
| **Prepared by** | Group 3 |
| **Document** | Implementation / Accomplishment Report — v1.0 |
| **Date** | June 22, 2026 |
| **Status** | Customer, Staff, and Admin modules implemented and running on-device |

> This document records what has been **built and verified** for the Cafinity system,
> mapped back to the Software Requirements Specification (SRS v1.0). It complements the
> [`README.md`](../README.md), which covers installation and how to run the app.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Implemented Features](#4-implemented-features)
5. [Database Implementation](#5-database-implementation)
6. [Requirements Traceability](#6-requirements-traceability)
7. [Project Structure](#7-project-structure)
8. [Testing & Validation](#8-testing--validation)
9. [Development Timeline](#9-development-timeline)
10. [Known Limitations & Future Work](#10-known-limitations--future-work)

---

## 1. Overview

Cafinity is a mobile-based cafe management and ordering system that digitises the
ordering experience for a coffee shop chain. The implemented system is a single
React Native application that serves **three user roles** from one codebase, with the
interface and permissions determined by the signed-in user's role:

- **Customer** — browses the menu, customises and orders drinks, pays, tracks the order
  in real time, and earns loyalty rewards.
- **Staff (Barista)** — works a live first-in-first-out order queue and advances each
  order's status.
- **Administrator** — views sales reports, monitors inventory, manages the menu, and
  assigns user roles.

All three roles share a cloud backend (Supabase / PostgreSQL) that enforces security and
business rules at the database level.

---

## 2. Technology Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Mobile framework | React Native (Expo SDK 54) | Runs on iOS & Android via Expo Go |
| Language | TypeScript | Strict mode, fully type-checked |
| Navigation | Expo Router | File-based routing |
| Styling | Tailwind CSS (NativeWind) | Utility-first styling |
| State management | Zustand | With AsyncStorage persistence |
| Backend-as-a-Service | Supabase | Auth, database, realtime, RPC |
| Database | PostgreSQL | Row-Level Security, triggers, functions |
| Location | expo-location | Nearest-branch detection |
| Notifications | expo-notifications | Local notifications |
| Version control | Git / GitHub | — |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────┐
│            Cafinity Mobile App                │
│        (React Native · Expo · TypeScript)     │
│                                               │
│   Role-based routing (index gate + RoleGate)  │
│   ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│   │ Customer │  │  Staff   │  │   Admin    │  │
│   │  tabs    │  │  queue   │  │  dashboard │  │
│   └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│        │   Zustand stores (auth/cart/branch)  │
│        └────────────┬───────────────┘         │
│              Data layer (src/lib/api.ts)      │
└───────────────────────┬───────────────────────┘
                        │ HTTPS / WebSocket
                        ▼
┌─────────────────────────────────────────────┐
│                  Supabase                     │
│  Auth │ PostgREST API │ Realtime │ RPC        │
│  PostgreSQL  ─ Row-Level Security policies    │
│              ─ Triggers & functions           │
│              ─ place_order / redeem_reward /   │
│                set_user_role                   │
└─────────────────────────────────────────────┘
```

**Key architectural decisions**

- **Single app, role-based experience.** The entry gate reads the user's role from their
  profile and routes to the Customer, Staff, or Admin area. Each protected area is guarded
  so users can only enter areas their role permits.
- **Business logic in the database.** Checkout runs through a single PostgreSQL function
  (`place_order`) so stock decrement, discounts, loyalty points, and the order record are
  written in **one atomic transaction** — preventing partial or duplicate charges.
- **Security enforced server-side.** Row-Level Security (RLS) policies decide what each role
  can read and write, so the rules hold even though the client key is public.

---

## 4. Implemented Features

### 4.1 Customer Module

| Feature | Description |
| --- | --- |
| Registration & login | Email/password accounts via Supabase Auth; session persists across launches |
| Branch selection (geolocation) | Detects location and lists branches **nearest-first**; shows open/closed and distance |
| Inventory-aware menu | Menu reflects the selected branch's stock; out-of-stock items are greyed out and unselectable |
| Drink customization | Size variants plus customization groups (temperature, sugar, milk, add-ons) with **live price updates** |
| Cart management | Add/remove items, change quantities, per-item customization summary |
| Promo codes | Apply discount codes with validation (`WELCOME10`, `CAFINITY50`, `STUDENT15`) |
| Simulated checkout | GCash / Cash payment methods; automatic total calculation |
| Failed-payment handling | Insufficient e-wallet balance is detected and the order is kept in the cart |
| Digital order ticket | Human-readable order number (`CF-YYMMDD-XXXX`) generated on checkout |
| Real-time order tracking | Status timeline (placed → preparing → ready → completed) that updates live |
| Notifications | Local notification fired when the order status changes |
| Loyalty program | Earns 1 point per ₱1; daily streak tracking with milestone bonus |
| Rewards redemption | Redeem points for vouchers; voucher codes issued |
| Feedback | Star rating + comment after an order is completed |
| Profile | View/edit name; view points, streak, and order history |

### 4.2 Staff Module

| Feature | Description |
| --- | --- |
| Live order queue | First-in-first-out list of active orders that updates in real time (Supabase Realtime) |
| Branch filter | View all branches or filter to one |
| Wait indicators | Time-since-order shown per ticket (highlighted when overdue) |
| Status management | One-tap **Start → Ready → Complete**; advancing status notifies the customer instantly |
| Order detail | Full item breakdown with every customization and the customer's note |
| Cancel order | Staff can cancel an order with confirmation |

### 4.3 Administrator Module

| Feature | Description |
| --- | --- |
| Sales reports | Revenue, order count, and average order value for **Today / This week / This month** |
| Top sellers | Best-selling products for the selected period |
| Customer ratings | Average rating and recent feedback |
| Inventory monitoring | Per-branch stock levels with **low-stock and out-of-stock alerts** |
| Stock management | Edit stock quantities and show/hide items |
| Menu management (CRUD) | Create, edit, and delete products; manage sizes, prices, availability, and featured status |
| User role management | List all accounts and assign roles (Customer / Staff / Admin) |

### 4.4 Cross-cutting Features

- **Role-Based Access Control (RBAC)** — three roles with route-level guards in the app and
  RLS policies in the database.
- **Real-time synchronisation** — order changes propagate between staff and customers
  instantly through Supabase Realtime.
- **Atomic transactions** — `place_order` guarantees order integrity under poor network
  conditions.
- **Security** — passwords are hashed by Supabase Auth; all traffic is over HTTPS; data
  access is constrained by RLS.

---

## 5. Database Implementation

### 5.1 Tables

| Table | Purpose |
| --- | --- |
| `users` | Profile linked to Supabase Auth; role, name, loyalty points, streak |
| `branches` | Store branches with GPS coordinates and hours |
| `product_categories` | Menu categories |
| `products` | Menu items |
| `product_variants` | Sizes/prices per product |
| `customization_groups` / `customization_options` | Drink customization options |
| `product_customization_link` | Links products to customization groups |
| `branch_inventory` | Per-branch stock levels (drives availability + low-stock alerts) |
| `orders` | Customer orders with status, totals, and payment info |
| `order_items` / `order_item_customization` | Order line items with price snapshots |
| `promotions` | Discount/promo codes |
| `rewards` / `reward_redemptions` | Rewards catalog and redemption records |
| `loyalty_transactions` | Points ledger |
| `feedback` | Order ratings and comments |

### 5.2 Functions & Triggers

| Object | Type | Role |
| --- | --- | --- |
| `place_order(...)` | RPC (atomic) | Validates stock, snapshots prices, applies promo, decrements inventory, awards points + streak, creates order — all in one transaction |
| `redeem_reward(...)` | RPC | Spends points and issues a voucher code |
| `set_user_role(...)` | RPC (admin-only) | Assigns Customer/Staff/Admin roles |
| `handle_new_user()` | Trigger | Creates a profile row when an account signs up |
| `set_order_number()` | Trigger | Generates the `CF-YYMMDD-XXXX` order number |
| `set_updated_at()` | Trigger | Maintains `updated_at` timestamps |
| `is_admin()` / `is_staff_or_admin()` | Helper | Role checks used by RLS policies |

### 5.3 Security & Realtime

- **Row-Level Security** is enabled on every table. Customers can only see their own orders;
  staff and admins can see and update all orders; only admins can write to the catalog and
  change roles.
- **Realtime** is enabled on the `orders` table so the staff queue and customer tracking
  update live.

---

## 6. Requirements Traceability

### 6.1 Functional & Non-Functional Requirements (from SRS §9)

| Req ID | Requirement | Status | Implemented in |
| --- | --- | --- | --- |
| FR-01 | Branch selection based on user location | ✅ Done | `branches.tsx`, `expo-location` |
| FR-02 | Display menu items based on available inventory | ✅ Done | `menu.tsx`, `branch_inventory` |
| FR-03 | Customize drink attributes | ✅ Done | `product/[id].tsx` |
| FR-04 | Complete checkout using e-wallet payment | ✅ Done (simulated) | `checkout.tsx`, `place_order` |
| FR-05 | Generate order ticket after successful payment | ✅ Done | `order/[id].tsx`, `set_order_number` |
| FR-06 | Award loyalty points after a completed purchase | ✅ Done | `place_order`, Rewards tab |
| FR-07 | Handle failed payment (insufficient funds) | ✅ Done (simulated) | `checkout.tsx` |
| NFR-01 | Prevent duplicate charging / data loss | ✅ Done | atomic `place_order` transaction |
| NFR-02 | Enforce input limits during customization | ✅ Done | quantity capped at 20 |

### 6.2 Additional SRS Functions

| SRS function (§2.2 / §3.4) | Status | Implemented in |
| --- | --- | --- |
| Secure login / logout & session handling | ✅ Done | Supabase Auth + auth store |
| Real-time order status updates | ✅ Done | Supabase Realtime |
| Push notifications for status/promos | ⚠️ Local notifications | `notify.ts` (see limitations) |
| Rewards redemption & daily streaks | ✅ Done | `rewards.tsx`, `redeem_reward` |
| Customer feedback / ratings | ✅ Done | `feedback` table |
| Inventory monitoring & low-stock alerts | ✅ Done | Admin → Inventory |
| FIFO staff order queue + status updates | ✅ Done | `staff/index.tsx` |
| Sales reporting (daily/weekly/monthly) | ✅ Done | Admin → Reports |
| Menu / pricing / attribute CRUD | ✅ Done | Admin → Menu |
| Role-based access control | ✅ Done | RoleGate + RLS |

### 6.3 Test Cases (from SRS §8.6)

| ID | Test | Status | Notes |
| --- | --- | --- | --- |
| TC-01 | Branch selection (GPS) | ✅ Pass | Nearest branch shown first |
| TC-02 | Out-of-stock item greyed out | ✅ Pass | "Hot Chocolate" sold out at Intramuros (seed) |
| TC-03 | Drink customization updates summary | ✅ Pass | Live price + summary |
| TC-04 | Payment success → order ticket | ✅ Pass | Ticket with order number |
| TC-05 | Reward points credited | ✅ Pass | Points balance increases |
| TC-06 | Insufficient funds | ✅ Pass | "Transaction Failed", cart kept |
| TC-07 | Network timeout / no double charge | ✅ Pass | Atomic transaction prevents partial/duplicate writes |
| TC-08 | Input limits (max quantity) | ✅ Pass | Quantity capped at 20 |

---

## 7. Project Structure

```
Cafinity/
├─ supabase/
│  ├─ schema.sql        # tables, enums, RLS, triggers, place_order/redeem_reward
│  ├─ seed.sql          # sample branches, menu, customizations, promos, rewards
│  └─ phase2.sql        # staff/admin RLS, set_user_role RPC
├─ src/
│  ├─ app/                       # Expo Router routes
│  │  ├─ index.tsx               # role-based redirect gate
│  │  ├─ (auth)/                 # login, register
│  │  ├─ (app)/                  # CUSTOMER — tabs, branches, product, cart, checkout, order
│  │  ├─ staff/                  # STAFF — realtime FIFO queue + order detail
│  │  └─ admin/                  # ADMIN — reports, inventory, menu, users
│  ├─ components/                # RoleGate + reusable UI (Button, Field, Screen, …)
│  ├─ lib/                       # supabase client, api, format, errors, notify
│  ├─ store/                     # Zustand: auth, branch, cart
│  ├─ types/models.ts            # domain types
│  └─ constants/theme.ts         # brand palette
├─ README.md                     # setup & run guide
└─ docs/PROJECT-DOCUMENTATION.md # this document
```

---

## 8. Testing & Validation

| Check | Result |
| --- | --- |
| TypeScript type-check (`tsc --noEmit`) | ✅ Passes with no errors |
| Expo project health (`expo-doctor`) | ✅ 18/18 checks pass |
| Production bundle (`expo export`, iOS) | ✅ Builds successfully |
| Backend connectivity preflight | ✅ Verified against the live Supabase project |
| On-device run (Expo Go) | ✅ Customer flow verified end-to-end on a physical device |

Testing approach follows the SRS test plan: **black-box / manual testing** on a physical
device, focused on the order-to-pickup flow.

---

## 9. Development Timeline

| Phase | Work completed |
| --- | --- |
| **Phase 1 — Customer app** | Project scaffold; Supabase schema, RLS, seed data; auth; branch selection; menu + customization; cart; checkout; order tracking; loyalty & rewards; profile |
| **SDK alignment** | Migrated the project from Expo SDK 56 to **SDK 54** to match the team's Expo Go runtime; realigned all native module versions |
| **Phase 2 — Staff & Admin** | Role-based routing; staff realtime FIFO queue; admin reports, inventory, menu CRUD, and user role management; phase-2 RLS and `set_user_role` |

---

## 10. Known Limitations & Future Work

- **Payments are simulated.** No live GCash/payment gateway is integrated; checkout models a
  successful or failed e-wallet payment, consistent with the SRS test plan.
- **Notifications are local, not remote push.** Expo Go (SDK 53+) does not support remote
  push; order-status updates use local notifications. True push would require a development
  build.
- **UI/UX polish is pending.** The interface is clean and fully functional, but a visual
  design pass is planned.
- **Future enhancements** — real payment gateway, remote push notifications, staff–branch
  assignment, exportable reports, and the visual design refinement.

---

*End of document.*
