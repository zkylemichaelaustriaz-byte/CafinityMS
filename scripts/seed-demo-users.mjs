// Provision the 9 presentation accounts (4 customers, 3 baristas, 2 admins).
// Idempotent: reuses existing accounts by email, creates only what's missing.
// Run:  node scripts/seed-demo-users.mjs --dry-run    (preview, no writes)
//       node scripts/seed-demo-users.mjs              (apply)
import { requireEnv, DRY_RUN } from "./lib/env.mjs";
import { getAdmin, findAuthUserByEmail } from "./lib/admin.mjs";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./demo-accounts.mjs";

requireEnv();
const admin = getAdmin();

const tag = DRY_RUN ? "[dry-run]" : "[apply]";
const log = (...a) => console.log(tag, ...a);

// --- branch resolution (baristas) -------------------------------------------
const { data: branchRows, error: bErr } = await admin
  .from("branches")
  .select("id, name, is_active")
  .order("name");
if (bErr) {
  console.error("✖ Could not read branches:", bErr.message);
  process.exit(1);
}
const activeBranches = (branchRows ?? []).filter((b) => b.is_active);
if (activeBranches.length === 0) console.warn("⚠ No active branches — baristas will be left unassigned.");

let baristaIndex = 0;
function resolveBranch(acct) {
  if (acct.branchName) {
    const m = activeBranches.find((b) => b.name.toLowerCase() === acct.branchName.toLowerCase());
    if (m) return m;
    console.warn(`⚠ Branch "${acct.branchName}" not found/active for ${acct.email} — auto-distributing.`);
  }
  if (activeBranches.length === 0) return null;
  const b = activeBranches[baristaIndex % activeBranches.length];
  baristaIndex++;
  return b;
}

// --- per-account reconcile ---------------------------------------------------
const report = { created: [], updated: [], preserved: [], skipped: [] };

for (const acct of DEMO_ACCOUNTS) {
  const email = acct.email.trim().toLowerCase();
  const wantBranch = acct.role === "staff" ? resolveBranch(acct) : null;
  const existing = await findAuthUserByEmail(email);

  if (!existing) {
    // CREATE — the handle_new_user trigger makes the profile row from metadata.
    if (DRY_RUN) {
      log(`CREATE ${email} (${acct.role}${wantBranch ? `, ${wantBranch.name}` : ""}) password=123456`);
      report.created.push(email);
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: acct.firstName, last_name: acct.lastName, demo_seed: true },
    });
    if (error) {
      console.error(`✖ create ${email}:`, error.message);
      report.skipped.push(email);
      continue;
    }
    const id = data.user.id;
    const patch = { role: acct.role };
    if (wantBranch) patch.branch_id = wantBranch.id;
    const { error: uErr } = await admin.from("users").update(patch).eq("id", id);
    if (uErr) console.error(`✖ set role/branch ${email}:`, uErr.message);
    log(`CREATED ${email} → ${acct.role}${wantBranch ? ` @ ${wantBranch.name}` : ""}`);
    report.created.push(email);
    continue;
  }

  // REUSE existing account — never touch first/last name or avatar.
  const id = existing.id;
  const { data: prof } = await admin
    .from("users")
    .select("role, branch_id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();

  const changes = [];
  const patch = {};
  if (prof && prof.role !== acct.role) {
    patch.role = acct.role;
    changes.push(`role ${prof.role}→${acct.role}`);
  }
  if (acct.role === "staff" && wantBranch && prof && prof.branch_id !== wantBranch.id) {
    // Only assign if currently unassigned OR a branch was explicitly requested.
    if (!prof.branch_id || acct.branchName) {
      patch.branch_id = wantBranch.id;
      changes.push(`branch → ${wantBranch.name}`);
    }
  }

  if (DRY_RUN) {
    const pw = acct.resetPassword === false ? "" : " + reset password=123456";
    log(`REUSE ${email} (${prof?.first_name ?? ""} ${prof?.last_name ?? ""})${changes.length ? " — " + changes.join(", ") : ""}${pw}`);
    (changes.length || acct.resetPassword !== false ? report.updated : report.preserved).push(email);
    continue;
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from("users").update(patch).eq("id", id);
    if (error) console.error(`✖ update ${email}:`, error.message);
  }
  if (acct.resetPassword !== false) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: DEMO_PASSWORD });
    if (error) console.error(`✖ reset password ${email}:`, error.message);
  }
  log(`REUSED ${email}${changes.length ? " — " + changes.join(", ") : " (no role/branch change)"}`);
  (changes.length || acct.resetPassword !== false ? report.updated : report.preserved).push(email);
}

// --- summary -----------------------------------------------------------------
const want = DEMO_ACCOUNTS.reduce(
  (a, x) => ((a[x.role] = (a[x.role] ?? 0) + 1), a),
  {},
);
console.log("\n──────── summary ────────");
console.log("created  :", report.created.length, report.created);
console.log("updated  :", report.updated.length, report.updated);
console.log("preserved:", report.preserved.length, report.preserved);
console.log("skipped  :", report.skipped.length, report.skipped);
console.log("target   : customers", want.customer ?? 0, "· baristas", want.staff ?? 0, "· admins", want.admin ?? 0);
console.log("password : 123456 (presentation accounts only)");
if (DRY_RUN) console.log("\nNo changes were written. Re-run without --dry-run to apply.");
