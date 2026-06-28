// =============================================================================
// Phase 12 — REVERSE the demonstration data (activity + inventory).
//   Removes ONLY rows tagged demo_batch = BATCH (never real data), undoes the
//   loyalty-balance contribution those rows made, recomputes last_order_date
//   from each customer's remaining (real) orders, and restores branch_inventory
//   from scripts/.inventory-backup.json.
//
//   node scripts/cleanup-demo-data.mjs --dry-run   # preview, writes nothing
//   node scripts/cleanup-demo-data.mjs             # apply
//
// This does NOT delete user accounts — that's cleanup-demo.mjs.
// =============================================================================
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requireEnv, DRY_RUN } from "./lib/env.mjs";
import { getAdmin } from "./lib/admin.mjs";
import { BATCH, deleteBatch } from "./lib/demo-data.mjs";

requireEnv();
const admin = getAdmin();
const tag = DRY_RUN ? "[dry-run]" : "[apply]";
const log = (...a) => console.log(tag, ...a);
const BACKUP = join(dirname(fileURLToPath(import.meta.url)), ".inventory-backup.json");

// --- 1. loyalty contribution per affected user (read BEFORE deleting) -------
const { data: demoTx } = await admin
  .from("loyalty_transactions").select("user_id, points").eq("demo_batch", BATCH);
const demoSumByUser = new Map();
for (const t of demoTx ?? []) {
  demoSumByUser.set(t.user_id, (demoSumByUser.get(t.user_id) ?? 0) + (t.points ?? 0));
}

// --- 2. delete tagged rows ---------------------------------------------------
let counts;
try { counts = await deleteBatch(admin, BATCH, { dryRun: DRY_RUN }); }
catch (e) { console.error("✖", e.message); process.exit(1); }
log("batch rows", DRY_RUN ? "to delete" : "deleted", ":", counts);

// --- 3. reverse loyalty balance + fix last_order_date -----------------------
for (const [userId, demoSum] of demoSumByUser) {
  const { data: prof } = await admin.from("users").select("loyalty_points").eq("id", userId).maybeSingle();
  if (!prof) continue;
  const newBalance = Math.max(0, (prof.loyalty_points ?? 0) - demoSum);
  // remaining (real) latest order for this user
  const { data: last } = await admin
    .from("orders").select("created_at").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const patch = { loyalty_points: newBalance, last_order_date: last ? last.created_at.slice(0, 10) : null };
  if (DRY_RUN) { log(`user ${userId}: balance ${prof.loyalty_points} → ${newBalance}`); continue; }
  const { error } = await admin.from("users").update(patch).eq("id", userId);
  if (error) console.error(`✖ reverse loyalty ${userId}:`, error.message);
}

// --- 4. restore inventory from snapshot -------------------------------------
if (existsSync(BACKUP)) {
  const snap = JSON.parse(readFileSync(BACKUP, "utf8"));
  log(`inventory snapshot found (${snap.rows?.length ?? 0} rows, taken ${snap.created_at})`);
  if (!DRY_RUN) {
    let restored = 0;
    for (const r of snap.rows ?? []) {
      const { error } = await admin.from("branch_inventory").update({
        stock_quantity: r.stock_quantity,
        low_stock_threshold: r.low_stock_threshold,
        is_available: r.is_available,
        updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (error) console.error(`✖ restore inv ${r.id}:`, error.message);
      else restored++;
    }
    log(`inventory restored: ${restored} rows`);
    rmSync(BACKUP);
    log("removed snapshot file (a fresh seed will re-snapshot).");
  }
} else {
  log("no inventory snapshot to restore (skipped).");
}

console.log(DRY_RUN
  ? "\nNo changes were written. Re-run without --dry-run to apply."
  : "\n✔ Demonstration data removed and balances/inventory restored.");
