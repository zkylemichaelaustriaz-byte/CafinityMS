// =============================================================================
// Phase 11 — verify the seeded data is DASHBOARD/REPORT ready and self-consistent.
//   Read-only. Checks volume, chronology, pricing math (re-derived from the same
//   compute_order_pricing RPC), order_items↔subtotal agreement, branch/date
//   spread (so admin reports have something to chart), feedback, loyalty sanity,
//   and inventory health distribution. Exits non-zero if a hard check fails.
//
//   node scripts/verify-demo-data.mjs
// =============================================================================
import { requireEnv } from "./lib/env.mjs";
import { getAdmin } from "./lib/admin.mjs";
import { BATCH } from "./lib/demo-data.mjs";

requireEnv();
const admin = getAdmin();
let ok = true;
const fail = (m) => { ok = false; console.log("  ✖", m); };
const pass = (m) => console.log("  ✓", m);

console.log("════════════════ CAFINITY DEMO-DATA VERIFICATION ════════════════");
console.log("batch:", BATCH, "\n");

// --- volume ------------------------------------------------------------------
async function count(table) {
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("demo_batch", BATCH);
  return count ?? 0;
}
const vol = {
  orders: await count("orders"), feedback: await count("feedback"),
  loyalty: await count("loyalty_transactions"), redemptions: await count("reward_redemptions"),
  notifications: await count("notifications"),
};
console.log("Volume:");
console.log("  orders", vol.orders, "· feedback", vol.feedback, "· loyalty", vol.loyalty,
  "· redemptions", vol.redemptions, "· notifications", vol.notifications);
if (vol.orders < 20) fail(`only ${vol.orders} seeded orders — expected dozens.`); else pass("order volume looks demo-ready.");

// --- pull seeded orders ------------------------------------------------------
const { data: orders } = await admin.from("orders")
  .select("id, branch_id, status, payment_status, paid_at, created_at, business_date, subtotal, tip_amount, total_amount, points_earned, statutory_discount, promo_discount, loyalty_reward_discount")
  .eq("demo_batch", BATCH).order("created_at", { ascending: true });

// --- chronology --------------------------------------------------------------
console.log("\nChronology:");
const now = Date.now();
const minTs = now - 70 * 86400000;
let badTime = 0, unpaid = 0;
for (const o of orders ?? []) {
  const t = new Date(o.created_at).getTime();
  if (t > now || t < minTs) badTime++;
  if (o.payment_status === "paid" && !o.paid_at) unpaid++;
}
if (badTime) fail(`${badTime} orders outside the last ~70 days / in the future.`); else pass("all orders fall within the recent window.");
if (unpaid) fail(`${unpaid} paid orders missing paid_at.`); else pass("paid orders all have paid_at.");
if (orders?.length) {
  const span = `${orders[0].business_date} → ${orders[orders.length - 1].business_date}`;
  console.log("  date span:", span);
}

// --- pricing consistency (re-derive via the SAME RPC) -----------------------
console.log("\nPricing consistency (sample):");
const sample = (orders ?? []).slice(0, 12);
let priceBad = 0, itemBad = 0;
for (const o of sample) {
  const { data: p, error } = await admin.rpc("compute_order_pricing", {
    p_subtotal: Number(o.subtotal), p_cust_total: 0, p_promo_disc: 0, p_reward_disc: 0,
    p_statutory: "", p_is_pickup: true, p_tip: Number(o.tip_amount), p_delivery: 0,
  });
  if (error) { fail(`RPC failed: ${error.message}`); break; }
  if (Math.abs(Number(p.final_total) - Number(o.total_amount)) > 0.01) priceBad++;
  // order_items must sum to the order subtotal
  const { data: items } = await admin.from("order_items").select("subtotal").eq("order_id", o.id);
  const itemSum = (items ?? []).reduce((s, it) => s + Number(it.subtotal), 0);
  if (Math.abs(itemSum - Number(o.subtotal)) > 0.01) itemBad++;
}
if (priceBad) fail(`${priceBad}/${sample.length} sampled totals disagree with compute_order_pricing.`);
else pass(`${sample.length} sampled totals match the pricing RPC exactly.`);
if (itemBad) fail(`${itemBad}/${sample.length} orders: item subtotals ≠ order subtotal.`);
else pass("order_items sum to their order subtotal.");

// --- branch + date spread (reports need variety) ----------------------------
console.log("\nReport spread:");
const byBranch = {}, byDate = new Set();
for (const o of orders ?? []) { byBranch[o.branch_id] = (byBranch[o.branch_id] ?? 0) + 1; byDate.add(o.business_date); }
const { data: branches } = await admin.from("branches").select("id, name");
const bn = (id) => (branches ?? []).find((b) => b.id === id)?.name ?? id;
console.log("  branches with orders:", Object.keys(byBranch).map((id) => `${bn(id)}(${byBranch[id]})`).join(", ") || "(none)");
console.log("  distinct business days:", byDate.size);
if (Object.keys(byBranch).length < 2) fail("orders span fewer than 2 branches — reports will look flat.");
else pass("orders span multiple branches.");
if (byDate.size < 10) fail("orders span fewer than 10 days."); else pass("orders span many days.");

// --- feedback ----------------------------------------------------------------
console.log("\nFeedback:");
const { data: fb } = await admin.from("feedback").select("rating").eq("demo_batch", BATCH);
if (fb?.length) {
  const avg = (fb.reduce((s, f) => s + f.rating, 0) / fb.length).toFixed(2);
  pass(`${fb.length} reviews, avg rating ${avg}.`);
} else fail("no seeded feedback.");

// --- loyalty sanity ----------------------------------------------------------
console.log("\nLoyalty:");
const { data: lt } = await admin.from("loyalty_transactions").select("user_id, points").eq("demo_batch", BATCH);
const earn = (lt ?? []).filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
const redeem = (lt ?? []).filter((t) => t.points < 0).reduce((s, t) => s + t.points, 0);
console.log(`  earned +${earn} · redeemed ${redeem} across ${new Set((lt ?? []).map((t) => t.user_id)).size} customers`);
const { data: negBal } = await admin.from("users").select("id, loyalty_points").lt("loyalty_points", 0);
if (negBal?.length) fail(`${negBal.length} users have negative loyalty_points.`); else pass("no negative balances.");

// --- inventory distribution --------------------------------------------------
console.log("\nInventory distribution (active branches):");
const { data: brs } = await admin.from("branches").select("id, is_active");
const activeIds = new Set((brs ?? []).filter((b) => b.is_active).map((b) => b.id));
const { data: inv } = await admin.from("branch_inventory").select("branch_id, stock_quantity, low_stock_threshold");
const dist = { Healthy: 0, Moderate: 0, Low: 0, Critical: 0, Out: 0 };
for (const r of inv ?? []) {
  if (!activeIds.has(r.branch_id)) continue;
  const q = r.stock_quantity ?? 0;
  if (q === 0) dist.Out++; else if (q <= 4) dist.Critical++; else if (q <= 10) dist.Low++;
  else if (q <= 24) dist.Moderate++; else dist.Healthy++;
}
console.log("  ", dist);
const nonEmpty = Object.values(dist).filter((n) => n > 0).length;
if (nonEmpty < 3) fail("inventory is too uniform (run seed-demo-inventory.mjs).");
else pass("inventory spans multiple health states.");

console.log("\n═════════════════════════════════════════════════════════════════");
console.log(ok ? "✔ Demo data is consistent and dashboard-ready." : "⚠ Some checks failed — see ✖ above.");
process.exit(ok ? 0 : 1);
