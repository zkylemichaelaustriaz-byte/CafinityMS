// =============================================================================
// Cafinity — PRE-PROVISIONING AUDIT (read-only). Run this FIRST.
//   node scripts/audit-demo.mjs
//
// Lists every Auth user, matches profiles + roles, reports current counts, and
// — critically — flags NEAR-DUPLICATE emails for each target account (e.g.
// angell@ vs angel@, maria@xample vs maria@example) so you confirm the RIGHT
// account exists before any provisioning runs. Writes nothing.
// =============================================================================
import { requireEnv } from "./lib/env.mjs";
import { getAdmin } from "./lib/admin.mjs";
import { DEMO_ACCOUNTS } from "./demo-accounts.mjs";

requireEnv();
const admin = getAdmin();

// --- gather every auth user --------------------------------------------------
const authUsers = [];
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("✖ listUsers:", error.message);
    process.exit(1);
  }
  authUsers.push(...(data?.users ?? []));
  if (!data || data.users.length < 200) break;
}

// --- profiles (role + branch) ------------------------------------------------
const { data: profiles, error: pErr } = await admin
  .from("users")
  .select("id, role, branch_id, first_name, last_name, all_branches_access");
if (pErr) {
  console.error("✖ read profiles:", pErr.message);
  process.exit(1);
}
const profById = new Map((profiles ?? []).map((p) => [p.id, p]));

const { data: branches } = await admin.from("branches").select("id, name, is_active");
const branchName = (id) => branches?.find((b) => b.id === id)?.name ?? null;
const activeBranches = (branches ?? []).filter((b) => b.is_active);

// --- helpers -----------------------------------------------------------------
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}
const lc = (e) => (e ?? "").trim().toLowerCase();
const emails = authUsers.map((u) => ({ id: u.id, email: lc(u.email) }));

// --- 1) project-wide tallies -------------------------------------------------
console.log("════════════════════ CAFINITY ACCOUNT AUDIT (read-only) ════════════════════\n");
const roleTally = (profiles ?? []).reduce((a, p) => ((a[p.role] = (a[p.role] ?? 0) + 1), a), {});
console.log("Auth users         :", authUsers.length);
console.log("Profiles           :", profiles?.length ?? 0);
console.log("By role            : customers", roleTally.customer ?? 0,
  "· baristas(staff)", roleTally.staff ?? 0, "· admins", roleTally.admin ?? 0);
console.log("Target             : customers 5 · baristas 5 · admins 3  (13 total)");
console.log("Active branches    :", activeBranches.length, activeBranches.map((b) => b.name).join(", ") || "(none)");
console.log("Total branches     :", branches?.length ?? 0);

// current barista assignments
const staffProfiles = (profiles ?? []).filter((p) => p.role === "staff");
console.log("\nCurrent baristas   :");
if (staffProfiles.length === 0) console.log("  (none)");
for (const p of staffProfiles) {
  const au = authUsers.find((u) => u.id === p.id);
  console.log(
    "  -",
    (au?.email ?? p.id).padEnd(34),
    "→",
    p.all_branches_access ? "ALL BRANCHES" : branchName(p.branch_id) ?? "(unassigned)",
  );
}

// --- 2) per-target lookup + near-duplicate detection -------------------------
console.log("\n──────────── target accounts: exact match + near-duplicates ────────────");
let warnings = 0;
for (const acct of DEMO_ACCOUNTS) {
  const target = lc(acct.email);
  const exact = emails.find((e) => e.email === target);
  const near = emails
    .filter((e) => e.email !== target && e.email && levenshtein(e.email, target) <= 1)
    .map((e) => e.email);

  let status = exact ? "EXISTS" : "missing → will CREATE";
  if (exact) {
    const prof = profById.get(exact.id);
    const role = prof?.role ?? "?";
    if (role !== acct.role) status += ` ⚠ role is ${role}, want ${acct.role}`;
  }
  console.log(`\n${acct.email}  [${acct.role}]`);
  console.log("  status        :", status);
  if (near.length) {
    warnings++;
    console.log("  ⚠ NEAR-MATCH  :", near.join(", "));
    console.log("                  → confirm which spelling is the real account before seeding.");
  }
}

// --- 3) explicit known-risk pairs -------------------------------------------
const knownPairs = [
  ["angell@example.com", "angel@example.com"],
  ["maria@xample.com", "maria@example.com"],
];
console.log("\n──────────── known typo-risk pairs ────────────");
for (const [a, b] of knownPairs) {
  const ea = emails.some((e) => e.email === lc(a));
  const eb = emails.some((e) => e.email === lc(b));
  console.log(`  ${a} : ${ea ? "EXISTS" : "absent"}    |    ${b} : ${eb ? "EXISTS" : "absent"}`);
  if (ea && eb) {
    warnings++;
    console.log("    ⚠ BOTH exist — decide which is correct; do NOT create a duplicate.");
  }
}

console.log("\n════════════════════════════════════════════════════════════════════════════");
console.log(warnings === 0
  ? "No near-duplicate conflicts detected. Safe to proceed to provisioning (dry-run first)."
  : `⚠ ${warnings} item(s) need your decision. Resolve emails in demo-accounts.mjs before seeding.`);
console.log("This script wrote nothing. Next: node scripts/seed-demo-users.mjs --dry-run");
