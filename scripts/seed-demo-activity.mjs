// =============================================================================
// Phase 9 — realistic historical ACTIVITY for the demo customers.
//   ~45-60 days of completed orders + items + loyalty ledger + feedback +
//   notifications + a few reward redemptions, all tagged demo_batch so they are
//   reversible (see cleanup-demo-data.mjs). Pricing/VAT/points are delegated to
//   the DB's compute_order_pricing() RPC so the math is always consistent — no
//   fabricated totals. Deterministic RNG → re-runs reproduce the same data.
//
//   node scripts/seed-demo-activity.mjs --dry-run   # preview, writes nothing
//   node scripts/seed-demo-activity.mjs             # apply
//
// Requires: phase35_demo_seed.sql applied; demo users provisioned first.
// =============================================================================
import { requireEnv, DRY_RUN } from "./lib/env.mjs";
import { getAdmin, findAuthUserByEmail } from "./lib/admin.mjs";
import { DEMO_ACCOUNTS } from "./demo-accounts.mjs";
import {
  BATCH, makeRng, randInt, pick, backdatedISO, businessDate, orderNumberFor, deleteBatch,
} from "./lib/demo-data.mjs";

requireEnv();
const admin = getAdmin();
const tag = DRY_RUN ? "[dry-run]" : "[apply]";
const log = (...a) => console.log(tag, ...a);
const rng = makeRng(0xca11fe); // fixed seed → reproducible activity

const round2 = (n) => Math.round(n * 100) / 100;
const FEEDBACK = [
  "Great coffee, exactly how I like it.", "Fast pickup and friendly staff.",
  "Consistent quality every time.", "A bit of a wait but worth it.",
  "Love the new seasonal flavors.", "Perfect morning fix.",
  "Smooth and not too sweet.", "Will order again.",
];
const PAY = ["GCash", "Cash", "Card"];

// --- 1. resolve demo customers ----------------------------------------------
const customerEmails = DEMO_ACCOUNTS.filter((a) => a.role === "customer").map((a) => a.email.toLowerCase());
const customers = [];
for (const email of customerEmails) {
  const au = await findAuthUserByEmail(email);
  if (!au) { console.warn(`⚠ ${email} not found in Auth — run seed-demo-users.mjs first. Skipping.`); continue; }
  const { data: prof } = await admin.from("users").select("id, loyalty_points").eq("id", au.id).maybeSingle();
  if (!prof) { console.warn(`⚠ ${email} has no profile row. Skipping.`); continue; }
  customers.push({ email, id: prof.id, loyalty_points: prof.loyalty_points ?? 0 });
}
if (customers.length === 0) { console.error("✖ No demo customers resolved. Provision users first."); process.exit(1); }

// --- 2. branches + sellable variant pool ------------------------------------
const { data: branches } = await admin.from("branches").select("id, name, is_active");
const activeBranches = (branches ?? []).filter((b) => b.is_active);
if (activeBranches.length === 0) { console.error("✖ No active branches."); process.exit(1); }

const { data: variantRows, error: vErr } = await admin
  .from("product_variants")
  .select("id, name, price, is_available, products!inner(name, is_available, is_seasonal, deleted_at)");
if (vErr) { console.error("✖ read variants:", vErr.message); process.exit(1); }
const pool = (variantRows ?? []).filter((v) =>
  v.is_available && Number(v.price) > 0 &&
  v.products?.is_available && !v.products?.is_seasonal && !v.products?.deleted_at,
).map((v) => ({ id: v.id, price: Number(v.price), variant_name: v.name, product_name: v.products.name }));
if (pool.length === 0) { console.error("✖ No sellable (non-seasonal, available) variants found."); process.exit(1); }

const { data: rewards } = await admin.from("rewards").select("id, name, points_cost").eq("is_active", true);
const rewardPool = (rewards ?? []).filter((r) => (r.points_cost ?? 0) > 0);

// --- 3. capture loyalty baseline, then clear any prior batch -----------------
// baseline = real balance with this batch's contribution removed, so re-runs
// (and cleanup) restore the true non-demo balance exactly.
const baseline = new Map();
for (const c of customers) {
  const { data: oldTx } = await admin
    .from("loyalty_transactions").select("points").eq("user_id", c.id).eq("demo_batch", BATCH);
  const oldDemoSum = (oldTx ?? []).reduce((s, t) => s + (t.points ?? 0), 0);
  baseline.set(c.id, (c.loyalty_points ?? 0) - oldDemoSum);
}

let cleared;
try { cleared = await deleteBatch(admin, BATCH, { dryRun: DRY_RUN }); }
catch (e) { console.error("✖", e.message); process.exit(1); }
log("cleared prior batch rows:", cleared);

// --- 4. pricing cache (RPC-backed, consistent math) -------------------------
const priceCache = new Map();
async function priceOrder(subtotal, tip) {
  const key = `${subtotal}|${tip}`;
  if (priceCache.has(key)) return priceCache.get(key);
  const { data, error } = await admin.rpc("compute_order_pricing", {
    p_subtotal: subtotal, p_cust_total: 0, p_promo_disc: 0, p_reward_disc: 0,
    p_statutory: "", p_is_pickup: true, p_tip: tip, p_delivery: 0,
  });
  if (error) throw new Error(`compute_order_pricing: ${error.message}`);
  priceCache.set(key, data);
  return data;
}

// --- 5. generate per-customer activity --------------------------------------
const stats = { orders: 0, items: 0, feedback: 0, loyaltyTx: 0, notifications: 0, redemptions: 0 };
let seq = randInt(rng, 1000, 4000); // starting order_number sequence

for (const c of customers) {
  const numOrders = randInt(rng, 8, 16);
  let demoSum = 0;
  let latestIso = null;

  // distinct days across the 45-60d window
  const days = new Set();
  while (days.size < numOrders) days.add(randInt(rng, 0, 58));
  const dayList = [...days].sort((a, b) => b - a); // oldest first

  for (const daysAgo of dayList) {
    const iso = backdatedISO(daysAgo, rng);
    if (!latestIso || iso > latestIso) latestIso = iso;
    const branch = pick(rng, activeBranches);

    // 1-3 distinct items
    const itemCount = randInt(rng, 1, 3);
    const chosen = [];
    const used = new Set();
    while (chosen.length < itemCount) {
      const v = pick(rng, pool);
      if (used.has(v.id)) continue;
      used.add(v.id);
      chosen.push({ ...v, qty: randInt(rng, 1, 2) });
    }
    const subtotal = round2(chosen.reduce((s, it) => s + it.price * it.qty, 0));
    const tip = rng() < 0.3 ? pick(rng, [5, 10, 15, 20]) : 0;

    stats.orders++; stats.items += chosen.length;
    if (DRY_RUN) {
      // estimate points for the dry-run loyalty summary without writing
      continue;
    }

    const p = await priceOrder(subtotal, tip);
    const orderNumber = orderNumberFor(iso, seq++);
    const orderRow = {
      user_id: c.id, branch_id: branch.id, order_number: orderNumber,
      status: "completed", payment_status: "paid", payment_method: pick(rng, PAY),
      paid_at: iso, notes: "", created_at: iso, updated_at: iso,
      business_date: businessDate(iso), display_queue_number: randInt(rng, 1, 60),
      demo_batch: BATCH,
      subtotal: p.merchandise_subtotal,
      customization_total: p.customization_total,
      promo_discount: p.promo_discount,
      loyalty_reward_discount: p.loyalty_reward_discount,
      statutory_discount: p.statutory_discount,
      discount_amount: round2((p.promo_discount ?? 0) + (p.loyalty_reward_discount ?? 0) + (p.statutory_discount ?? 0)),
      vat_exempt_amount: p.vat_exempt_amount, vat_amount: p.vat_amount,
      vat_rate_snapshot: p.vat_rate, prices_vat_inclusive_snapshot: p.prices_vat_inclusive,
      service_fee: p.service_fee, delivery_fee: p.delivery_fee, tip_amount: p.tip_amount,
      points_eligible_amount: p.points_eligible_amount, points_earned: p.points_to_earn,
      total_amount: p.final_total,
    };
    const { data: ins, error: oErr } = await admin.from("orders").insert(orderRow).select("id").single();
    if (oErr) { console.error(`✖ order ${orderNumber}:`, oErr.message); continue; }
    const orderId = ins.id;

    const items = chosen.map((it) => ({
      order_id: orderId, product_variant_id: it.id,
      product_name: it.product_name, variant_name: it.variant_name,
      quantity: it.qty, unit_price: it.price, subtotal: round2(it.price * it.qty),
    }));
    const { error: iErr } = await admin.from("order_items").insert(items);
    if (iErr) console.error(`✖ items ${orderNumber}:`, iErr.message);

    // loyalty earn
    const pts = p.points_to_earn ?? 0;
    if (pts > 0) {
      await admin.from("loyalty_transactions").insert({
        user_id: c.id, order_id: orderId, points: pts, type: "earn",
        description: `Earned from order ${orderNumber}`, created_at: iso, demo_batch: BATCH,
      });
      demoSum += pts; stats.loyaltyTx++;
    }

    // feedback on ~55% of orders (weighted to high ratings)
    if (rng() < 0.55) {
      const rating = rng() < 0.7 ? 5 : rng() < 0.6 ? 4 : 3;
      const fIso = new Date(new Date(iso).getTime() + randInt(rng, 5, 90) * 60000).toISOString();
      const { error: fErr } = await admin.from("feedback").insert({
        order_id: orderId, user_id: c.id, rating, comment: pick(rng, FEEDBACK),
        created_at: fIso, demo_batch: BATCH,
      });
      if (!fErr) stats.feedback++;
    }

    // backdate + tag the auto order_placed notification (created by trigger)
    await admin.from("notifications")
      .update({ created_at: iso, demo_batch: BATCH, read_at: daysAgo > 3 ? iso : null })
      .eq("type", "order_placed").is("demo_batch", null)
      .filter("data->>order_id", "eq", orderId);
    stats.notifications++;
  }

  // a couple of reward redemptions per customer (if catalog + points allow)
  if (!DRY_RUN && rewardPool.length) {
    const nRedeem = randInt(rng, 0, 2);
    for (let i = 0; i < nRedeem; i++) {
      const r = pick(rng, rewardPool);
      const cost = r.points_cost ?? 0;
      if (cost <= 0 || baseline.get(c.id) + demoSum - cost < 0) continue; // never go negative
      const daysAgo = randInt(rng, 0, 50);
      const iso = backdatedISO(daysAgo, rng);
      const code = `RWD-${Math.floor(rng() * 1e6).toString().padStart(6, "0")}`;
      await admin.from("reward_redemptions").insert({
        user_id: c.id, reward_id: r.id, reward_name: r.name, points_spent: cost,
        code, is_used: rng() < 0.6, created_at: iso, demo_batch: BATCH,
      });
      await admin.from("loyalty_transactions").insert({
        user_id: c.id, points: -cost, type: "redeem",
        description: `Redeemed: ${r.name}`, created_at: iso, demo_batch: BATCH,
      });
      demoSum -= cost; stats.redemptions++; stats.loyaltyTx++;
    }
  }

  // a few promo/reward announcement notifications (curated, backdated)
  if (!DRY_RUN) {
    const announce = [
      { type: "promotion", title: "Double points weekend", body: "Earn 2x points on all drinks this weekend." },
      { type: "reward", title: "You're close to a free drink", body: "A little more and your next reward unlocks." },
      { type: "promotion", title: "New seasonal menu", body: "Fresh flavors just dropped — come try them." },
    ];
    for (const a of announce.slice(0, randInt(rng, 1, 3))) {
      const daysAgo = randInt(rng, 0, 40);
      const iso = backdatedISO(daysAgo, rng);
      await admin.from("notifications").insert({
        user_id: c.id, type: a.type, title: a.title, body: a.body,
        data: {}, created_at: iso, read_at: daysAgo > 5 ? iso : null, demo_batch: BATCH,
      });
      stats.notifications++;
    }
  }

  // reconcile loyalty balance + last_order_date (reversible via baseline)
  if (!DRY_RUN) {
    const newBalance = Math.max(0, baseline.get(c.id) + demoSum);
    const patch = { loyalty_points: newBalance };
    if (latestIso) patch.last_order_date = businessDate(latestIso);
    const { error: uErr } = await admin.from("users").update(patch).eq("id", c.id);
    if (uErr) console.error(`✖ reconcile ${c.email}:`, uErr.message);
    log(`${c.email}: ${dayList.length} orders, balance → ${newBalance} pts`);
  } else {
    log(`${c.email}: would create ${dayList.length} orders`);
  }
}

// --- 6. summary --------------------------------------------------------------
console.log("\n──────── activity summary ────────");
console.log("batch       :", BATCH);
console.log("customers   :", customers.length);
console.log("orders      :", stats.orders);
console.log("order items :", stats.items);
console.log("feedback    :", stats.feedback);
console.log("loyalty tx  :", stats.loyaltyTx);
console.log("redemptions :", stats.redemptions);
console.log("notifications:", stats.notifications);
if (DRY_RUN) console.log("\nNo changes were written. Re-run without --dry-run to apply.");
else console.log("\n✔ Activity seeded. Next: node scripts/seed-demo-inventory.mjs");
