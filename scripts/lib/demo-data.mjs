// =============================================================================
// Shared helpers for the demonstration-DATA seeders (Phases 9-12).
//   - BATCH: the tag written to demo_batch on every seeded row (see phase35).
//   - Deterministic PRNG so re-runs produce IDENTICAL data (idempotency).
//   - Date helpers for backdating into the last 45-60 days.
//   - deleteBatch(): removes ONLY rows tagged with BATCH, in FK-safe order.
// Requires migration phase35_demo_seed.sql to be applied first.
// =============================================================================

// Bump this (e.g. demo_v2) only if you want a clean parallel batch; cleanup and
// verify default to the same value, so normally leave it alone.
export const BATCH = "demo_v1";

// ---- deterministic RNG (mulberry32) ----------------------------------------
// Same seed → same sequence → re-running the seeder reproduces the same orders.
export function makeRng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---- date helpers -----------------------------------------------------------
// Returns an ISO timestamp `daysAgo` days back, at a plausible cafe hour.
export function backdatedISO(daysAgo, rng) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  // cafe hours 7:00-20:00 local-ish; keep it deterministic via rng
  const hour = randInt(rng, 7, 20);
  const minute = randInt(rng, 0, 59);
  const second = randInt(rng, 0, 59);
  d.setUTCHours(hour, minute, second, 0);
  return d.toISOString();
}
export const businessDate = (iso) => iso.slice(0, 10); // YYYY-MM-DD

// Human order number from a backdated date: CF-YYMMDD-XXXX.
export function orderNumberFor(iso, seq) {
  const d = new Date(iso);
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `CF-${yy}${mm}${dd}-${String(seq).padStart(4, "0")}`;
}

// ---- batch teardown (used by the seeder for idempotency AND by cleanup) -----
// Deletes ONLY rows tagged with `batch`. Order matters: child/independent rows
// first, then orders (order_items + order_item_customization cascade from
// orders; loyalty_transactions.order_id is ON DELETE SET NULL, so those must be
// removed explicitly by tag or they'd orphan).
export async function deleteBatch(admin, batch = BATCH, { dryRun = false } = {}) {
  const tables = [
    "notifications",
    "feedback",
    "loyalty_transactions",
    "reward_redemptions",
    "orders", // last: cascades order_items + order_item_customization
  ];
  const counts = {};
  for (const t of tables) {
    const { count, error: cErr } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("demo_batch", batch);
    if (cErr) {
      // Most likely cause: phase35 migration not applied yet.
      throw new Error(`Could not read ${t}.demo_batch (${cErr.message}). Apply phase35_demo_seed.sql first.`);
    }
    counts[t] = count ?? 0;
    if (!dryRun && (count ?? 0) > 0) {
      const { error } = await admin.from(t).delete().eq("demo_batch", batch);
      if (error) throw new Error(`delete ${t}: ${error.message}`);
    }
  }
  return counts;
}
