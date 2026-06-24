# Phase 3 — Functional & Security Hardening: Change Summary

This phase resolved backend/security/workflow defects identified in the functional audit. It
**did not** touch the visual theme, route layouts, or begin the UI/UX overhaul.

---

## 1. Supabase execution order

Run in the SQL Editor, in this order (the new file is last):

```
schema.sql  →  seed.sql  →  phase2.sql  →  phase3_hardening.sql
```

`phase3_hardening.sql` is idempotent and safe to re-run. It also **backfills** missing
`branch_inventory` rows, so existing projects are corrected on first run.

---

## 2. Files changed

### Database (new)
- **`supabase/phase3_hardening.sql`** — all of the below:
  - `checkout_request_id` column + unique index (idempotent checkout).
  - `order_items.item_notes` column.
  - `users.loyalty_points >= 0` check constraint.
  - Closed-by-default inventory: triggers on new variants/branches + backfill.
  - Collision-safe order numbers (advisory lock).
  - Rewritten `place_order`: validates branch active, product/variant available &
    not-deleted, inventory present & sufficient, quantity 1–20 (+ order cap), customization
    linkage & single-select, payment method whitelist, note length; idempotency; Cash vs
    GCash payment; milestone-once-per-day; per-item notes; **reward voucher** redemption.
  - Atomic `redeem_reward` (conditional debit, no negative balance).
  - New RPCs: `advance_order_status`, `cancel_order` (restores stock, reverses points, returns
    voucher/promo usage, voids payment), `confirm_cash_payment`, `update_my_profile`,
    `submit_feedback`.
  - RLS lockdown: removed `users_update_own`, `orders_insert_own`, `orders_update_own`,
    direct `order_items`/`feedback` writes — mutations now go only through the RPCs.

### Frontend (new)
- `src/lib/id.ts` — `uuidv4()` for the checkout idempotency token.
- `src/components/ui/ErrorState.tsx` — error + retry UI (uses existing styling).
- `eslint.config.js` — ESLint flat config (the project had none).

### Frontend (edited)
| File | Change |
| --- | --- |
| `src/lib/api.ts` | `placeOrder` sends `checkout_request_id` + `item_notes`; `updateOrderStatus` → `advanceOrderStatus`/`cancelOrder`/`confirmCashPayment`; `updateProfile` → `update_my_profile` RPC; `submitFeedback` → `submit_feedback` RPC; menu treats **missing inventory as unavailable**; `ORDER_SELECT` includes `item_notes` |
| `src/types/models.ts` | `OrderItem.item_notes` |
| `src/store/cart.ts` | `checkoutId` + `ensureCheckoutId()`; cleared on clear / branch change |
| `src/app/(app)/checkout.tsx` | Branch-match guard, idempotency token, per-item notes in payload |
| `src/app/(app)/branches.tsx` | Confirm before switching branch with a non-empty cart; loader → `useCallback` |
| `src/app/staff/index.tsx` | Advance via RPC; error/retry state |
| `src/app/staff/order/[id].tsx` | Advance/cancel via RPC; **Confirm cash payment** action; shows item notes |
| `src/app/(app)/order/[id].tsx` | Shows item notes |
| `src/app/admin/(tabs)/index.tsx` | Reports fetch from earliest period boundary; ratings filtered by period; error state |
| `src/app/(app)/(tabs)/menu.tsx`, `orders.tsx`, `rewards.tsx` | Loading / empty / **error+retry** states |
| `src/app/admin/(tabs)/inventory.tsx`, `menu.tsx`, `users.tsx` | Error+retry states; inventory `useEffect` dependency fix |
| `src/app/(app)/(tabs)/profile.tsx` | Blank-name validation |
| `src/app/(app)/(tabs)/home.tsx`, `src/app/admin/product/[id].tsx` | Removed unused imports |

### Removed
- `src/hooks/use-color-scheme.ts`, `use-color-scheme.web.ts` — unused template files.

---

## 3. Requirements traceability (security additions)

| Req | Requirement | Status | Where |
| --- | --- | --- | --- |
| SEC-A | Customers cannot modify role/points/protected fields | ✅ | `users_update_own` removed; `update_my_profile` RPC |
| SEC-B | Orders read-only to customers after checkout | ✅ | order insert/update policies removed; RPC-only mutations |
| SEC-C | Staff limited to valid status transitions | ✅ | `advance_order_status` / `cancel_order` |
| SEC-D | Idempotent checkout (no duplicate orders) — backs **TC-07** | ✅ | `checkout_request_id` + unique index |
| SEC-E | Strict server-side checkout validation | ✅ | rewritten `place_order` |
| SEC-F | Closed-by-default inventory | ✅ | triggers + backfill + menu rule |
| SEC-G | Atomic cancellation (stock + points + promo/voucher) | ✅ | `cancel_order` |
| SEC-H | Cash unpaid until confirmed | ✅ | `place_order` + `confirm_cash_payment` |
| SEC-I | Milestone bonus once per day | ✅ | `place_order` (new-day guard) |
| SEC-J | Reward vouchers usable once | ✅ | `place_order` voucher path + `is_used` |
| SEC-K | Feedback only on own completed orders | ✅ | `submit_feedback` |

---

## 4. Project health (executed)

- `npx tsc --noEmit` → **0 errors**.
- `npx eslint .` → **0 errors, 1 warning** (React-Compiler `set-state-in-effect` advisory on
  the branches loader; configured as a warning).
- `npx expo export -p ios` → **bundles successfully**.
- Database/RPC and on-device behaviour tests → **see [TESTING.md](TESTING.md); not yet
  executed** (steps provided; must be run against the live project before claiming passed).

---

## 5. Audit points acknowledged but intentionally NOT changed

- **"Failed GCash must not create an order"** — already handled: the client checks the
  simulated balance and returns before calling `place_order`. Retained.
- **expo-doctor "16/18"** — in the auditor's offline environment two checks needed internet.
  In this environment `expo-doctor` reports **18/18**; the difference is environmental, not a
  defect.
- **`.env` present in the shared ZIP** — `.gitignore` already excludes `.env`; `.env.example`
  is the tracked template. Recommendation (process, not code): don't include `.env` in
  submission ZIPs, and rotate the key if it was shared. No code change.
- **Customer routes only check session (not role)** — intentional: any signed-in user may use
  the customer ordering area; the **sensitive** Staff/Admin areas remain role-gated by
  `RoleGate` and enforced server-side by RLS.

---

## 6. Known limitations still remaining

- **Streak reversal on cancellation:** cancelling reverses *points* (floored at 0) and records
  a ledger entry, but does **not** roll back the day's streak counter (correct rollback needs a
  per-day order-event history). Documented trade-off.
- **Notifications:** in-app realtime tracking with best-effort **local** notifications while
  the relevant screen is active; no remote push or promotional notifications (Expo Go limit).
- **Admin customization CRUD:** admins manage products/variants/prices/inventory, but not yet
  customization groups/options (temperature, sweetness, milk, add-ons). Partial vs SRS §3.4 —
  scheduled for a later phase.
- **Payments are simulated** (no live GCash gateway); GCash "success" cannot be validated
  server-side.
- **Automated test suite:** none yet; manual/integration cases are documented in TESTING.md
  but have not been executed.
