// =============================================================================
// Phase 10 — nonuniform branch INVENTORY for a lifelike dashboard.
//   Spreads existing branch_inventory rows across health buckets so the admin
//   inventory views show a realistic mix instead of uniform stock:
//     Healthy 25-90 · Moderate 11-24 · Low 5-10 · Critical 1-4 · Out 0
//   Assignment is DETERMINISTIC (hash of branch+variant) so re-runs are stable.
//
//   Reversible: the ORIGINAL stock of every row it touches is snapshotted ONCE
//   to scripts/.inventory-backup.json (gitignored). cleanup-demo-data.mjs
//   restores from it. Only UPDATES existing rows — never creates/deletes them.
//
//   node scripts/seed-demo-inventory.mjs --dry-run   # preview, writes nothing
//   node scripts/seed-demo-inventory.mjs             # apply
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requireEnv, DRY_RUN } from "./lib/env.mjs";
import { getAdmin } from "./lib/admin.mjs";

requireEnv();
const admin = getAdmin();
const tag = DRY_RUN ? "[dry-run]" : "[apply]";
const log = (...a) => console.log(tag, ...a);
const BACKUP = join(dirname(fileURLToPath(import.meta.url)), ".inventory-backup.json");

// stable 0..1 from a string (FNV-1a) → deterministic, nonuniform bucket choice
function hashUnit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
const buckets = [
  { name: "Healthy", w: 0.45, lo: 25, hi: 90 },
  { name: "Moderate", w: 0.25, lo: 11, hi: 24 },
  { name: "Low", w: 0.15, lo: 5, hi: 10 },
  { name: "Critical", w: 0.10, lo: 1, hi: 4 },
  { name: "Out", w: 0.05, lo: 0, hi: 0 },
];
function bucketFor(key) {
  const u = hashUnit(key);
  let acc = 0;
  for (const b of buckets) { acc += b.w; if (u < acc) return b; }
  return buckets[0];
}
// deterministic value within a bucket from a second hash
function stockFor(b, key) {
  if (b.hi === b.lo) return b.lo;
  const u = hashUnit("q:" + key);
  return b.lo + Math.floor(u * (b.hi - b.lo + 1));
}

// --- active-branch inventory rows -------------------------------------------
const { data: branches } = await admin.from("branches").select("id, name, is_active");
const activeIds = new Set((branches ?? []).filter((b) => b.is_active).map((b) => b.id));
const branchName = (id) => (branches ?? []).find((b) => b.id === id)?.name ?? id;

const { data: rows, error } = await admin
  .from("branch_inventory")
  .select("id, branch_id, product_variant_id, stock_quantity, low_stock_threshold, is_available");
if (error) { console.error("✖ read inventory:", error.message); process.exit(1); }
const targetRows = (rows ?? []).filter((r) => activeIds.has(r.branch_id));
if (targetRows.length === 0) { console.error("✖ No inventory rows for active branches."); process.exit(1); }

// --- snapshot ORIGINAL state once (for reversible restore) ------------------
if (!DRY_RUN && !existsSync(BACKUP)) {
  const snap = targetRows.map((r) => ({
    id: r.id, stock_quantity: r.stock_quantity,
    low_stock_threshold: r.low_stock_threshold, is_available: r.is_available,
  }));
  writeFileSync(BACKUP, JSON.stringify({ created_at: new Date().toISOString(), rows: snap }, null, 2));
  log(`snapshot written → ${BACKUP} (${snap.length} rows)`);
} else if (!DRY_RUN) {
  log(`snapshot already exists → ${BACKUP} (kept; preserves original state)`);
}

// --- apply buckets -----------------------------------------------------------
const dist = {};
const nowIso = new Date().toISOString();
let updated = 0;
for (const r of targetRows) {
  const key = `${r.branch_id}:${r.product_variant_id}`;
  const b = bucketFor(key);
  const stock = stockFor(b, key);
  dist[b.name] = (dist[b.name] ?? 0) + 1;
  if (DRY_RUN) continue;
  const { error: uErr } = await admin.from("branch_inventory").update({
    stock_quantity: stock,
    is_available: stock > 0,
    low_stock_threshold: 10,
    updated_at: nowIso,
  }).eq("id", r.id);
  if (uErr) { console.error(`✖ ${branchName(r.branch_id)} row ${r.id}:`, uErr.message); continue; }
  updated++;
}

// --- summary -----------------------------------------------------------------
console.log("\n──────── inventory summary ────────");
console.log("active branches :", activeIds.size);
console.log("rows targeted   :", targetRows.length);
console.log("distribution    :", dist);
if (!DRY_RUN) console.log("rows updated    :", updated);
if (DRY_RUN) console.log("\nNo changes were written. Re-run without --dry-run to apply.");
else console.log("\n✔ Inventory seeded. Restore anytime via cleanup-demo-data.mjs.");
