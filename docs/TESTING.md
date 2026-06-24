# Cafinity — Test Plan & Cases (Phase 3: Functional & Security Hardening)

This document lists the test cases for the hardening work. **Honesty note:** only the
automated checks (TypeScript, ESLint) were actually executed in this environment. The
database/RPC and UI behaviour cases are written as **repeatable manual steps** and are marked
**Not yet executed** — they must be run against a live Supabase project + Expo Go device and
their results recorded before being claimed as passed.

---

## A. Automated checks (executed)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **Pass — 0 errors** |
| ESLint | `npx eslint .` | **0 errors, 1 warning** (a React-Compiler `set-state-in-effect` advisory on the branches loader, configured as a warning) |

> Production bundle: `npx expo export -p ios` was run to confirm the app still compiles end to
> end after the changes.

---

## B. Test environment & seed accounts

1. Run, in order, in the Supabase SQL Editor: `schema.sql` → `seed.sql` → `phase2.sql` →
   `phase3_hardening.sql`.
2. Create three accounts in the app, then promote two:
   ```sql
   update public.users set role = 'admin' where email = 'admin@cafinity.test';
   update public.users set role = 'staff' where email = 'staff@cafinity.test';
   -- a third account stays 'customer'
   ```
3. "Direct call" steps below mean calling Supabase from the client SDK or REST with the
   **customer's** session token (e.g. a scratch screen or the Supabase dashboard's API docs),
   to prove the server rejects actions the UI never exposes.

---

## C. Security (RLS / RBAC)

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | Customer cannot change own role | As customer, direct call `supabase.from('users').update({ role:'admin' }).eq('id', myId)` | Update affects **0 rows** (no update policy on `users`) | Not yet executed |
| SEC-02 | Customer cannot change order status | As customer, direct call `update orders set status='completed' where id=<own order>` | **0 rows** / RLS denies (no order update policy) | Not yet executed |
| SEC-03 | Staff cannot edit order totals | As staff, direct call `update orders set total_amount=0 where id=<any>` | **0 rows** / denied (status changes only via RPC) | Not yet executed |
| SEC-04 | Invalid transition rejected | As staff, call `advance_order_status` on a `pending` order twice quickly, or attempt to complete a `pending` order via repeated calls | Goes pending→preparing→ready→completed only; any out-of-order/`completed`→… call raises "Order cannot be advanced" | Not yet executed |
| SEC-05 | Only admin assigns roles | As customer/staff, call `set_user_role(...)` | Raises "Only admins can change roles" | Not yet executed |
| SEC-06 | Profile update is name-only | As customer, call `update_my_profile('A','B')` then try a direct `update users set loyalty_points=9999` | Names change; the direct points update affects 0 rows | Not yet executed |

## D. Ordering & checkout

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| ORD-01 | Idempotent checkout | Place an order; call `place_order` again with the **same** `p_checkout_request_id` | Second call returns the **same** order (`idempotent: true`); no duplicate row, no double stock/points | Not yet executed |
| ORD-02 | Last-stock race | Set a variant's branch stock to 1; two users check out the same item simultaneously | Exactly **one** succeeds; the other gets "Insufficient stock" | Not yet executed |
| ORD-03 | Missing inventory = unavailable | Remove a variant's `branch_inventory` row; open the menu and attempt checkout | Item shows unavailable; `place_order` raises "not available at this branch" | Not yet executed |
| ORD-04 | Deleted/hidden product rejected | Soft-delete or hide a product after it's in the cart; check out | `place_order` raises "no longer available" | Not yet executed |
| ORD-05 | Quantity ceiling | Direct call `place_order` with quantity 21 | Raises "Quantity … must be between 1 and 20" | Not yet executed |
| ORD-06 | Unlinked customization rejected | Direct call with a `customization_option_id` whose group isn't linked to the product | Raises "Customization is not allowed for …" | Not yet executed |
| ORD-07 | Single-select enforced | Direct call passing two options of a `single` group | Raises "Only one option allowed for …" | Not yet executed |
| ORD-08 | Invalid payment method | Direct call with `p_payment_method='Crypto'` | Raises "Invalid payment method" | Not yet executed |

## E. Cart & branch integrity

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| CART-01 | Branch switch guard | Add items at Branch A; choose Branch B | Confirmation dialog; choosing "Switch & clear" empties the cart. Checkout never submits A's cart to B (server also re-checks) | Not yet executed |
| CART-02 | Item notes reach staff | Add a drink with note "extra hot"; check out; open the order in the staff app | Staff order detail shows "Note: extra hot" | Not yet executed |

## F. Payments

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| PAY-01 | Cash stays unpaid | Check out with **Cash** | `payment_status = pending`; staff sees "Confirm cash payment"; order can't be completed until confirmed | Not yet executed |
| PAY-02 | GCash insufficient funds | Set simulated GCash balance below total; pay | "Transaction Failed"; **no order created**; cart kept | Not yet executed |
| PAY-03 | GCash success | Pay with sufficient balance | `payment_status = paid`; order ticket issued | Not yet executed |

## G. Loyalty & rewards

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| LOY-01 | Milestone once per day | With a streak that hits a multiple of 5, place two orders the same day | The +50 bonus is awarded **only on the first** order that day | Not yet executed |
| LOY-02 | Cancellation reverses points | Place an order, then cancel it (staff) | Points from that order are removed (floored at 0); a reversal row appears in `loyalty_transactions`; stock restored | Not yet executed |
| RWD-01 | Voucher used once | Redeem a reward to get `RWD-…`; use it as the promo code at checkout; try to reuse it | First checkout applies the discount and sets `is_used = true`; second use is rejected | Not yet executed |
| RWD-02 | No negative balance under concurrency | Two simultaneous `redeem_reward` calls that each cost more than half the balance | Only the affordable number succeed; balance never goes below 0 (DB check + conditional update) | Not yet executed |

## H. Feedback

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| FDB-01 | No feedback before completion | Direct call `submit_feedback` on a `pending`/`ready` order | Raises "You can only review completed orders" | Not yet executed |
| FDB-02 | One feedback per order | Submit feedback twice on a completed order | Second submission updates the same row (no duplicates) | Not yet executed |

## I. Reporting & error handling

| ID | Test | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| REP-01 | Week crossing month boundary | Have orders in the last days of the previous month within the current week; open Reports → This week | Those orders are included in the week total | Not yet executed |
| REP-02 | Ratings follow the period | Switch the period selector | The average rating and the listed feedback change to match the period | Not yet executed |
| ERR-01 | Failed load shows error, not empty | Disconnect from the network, open Menu / Orders / Rewards / Staff queue / Reports / Inventory / Users | Each shows an **error with Retry**, not a false "empty" state | Not yet executed |

## J. Original SRS test cases (re-verify on device)

TC-01…TC-08 from the SRS still apply (branch selection, out-of-stock greyed out, customization
summary, payment success/ticket, reward points, insufficient funds, no double charge, input
limits). **TC-07 (no double charge)** is now backed by the idempotent `place_order`
(`checkout_request_id`) and should be re-tested per ORD-01.

---

*All "Not yet executed" rows must be run and their actual results recorded (with screenshots)
before being reported as passed.*
