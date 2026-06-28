// Verify the presentation account set. Read-only. Run: node scripts/verify-demo.mjs
import { requireEnv } from "./lib/env.mjs";
import { getAdmin, findAuthUserByEmail } from "./lib/admin.mjs";
import { DEMO_ACCOUNTS } from "./demo-accounts.mjs";

requireEnv();
const admin = getAdmin();

const roleLabel = (r) => (r === "staff" ? "Barista" : r === "admin" ? "Administrator" : "Customer");

const { data: branchRows } = await admin.from("branches").select("id, name");
const branchName = (id) => branchRows?.find((b) => b.id === id)?.name ?? null;

let ok = true;
console.log("Account                              role            branch            status");
console.log("──────────────────────────────────────────────────────────────────────────────");
for (const acct of DEMO_ACCOUNTS) {
  const authUser = await findAuthUserByEmail(acct.email);
  if (!authUser) {
    ok = false;
    console.log(acct.email.padEnd(36), "—".padEnd(15), "—".padEnd(17), "MISSING");
    continue;
  }
  const { data: prof } = await admin
    .from("users")
    .select("role, branch_id")
    .eq("id", authUser.id)
    .maybeSingle();
  const role = prof?.role ?? "?";
  const br = prof?.branch_id ? branchName(prof.branch_id) : null;
  const problems = [];
  if (role !== acct.role) problems.push(`role is ${role}, want ${acct.role}`);
  if (acct.role === "staff" && !br) problems.push("no branch");
  if (problems.length) ok = false;
  console.log(
    acct.email.padEnd(36),
    roleLabel(role).padEnd(15),
    (br ?? "—").padEnd(17),
    problems.length ? "⚠ " + problems.join("; ") : "OK",
  );
}

// Role tallies across the whole project.
const { data: allUsers } = await admin.from("users").select("role");
const tally = (allUsers ?? []).reduce((a, u) => ((a[u.role] = (a[u.role] ?? 0) + 1), a), {});
console.log("\nProject totals → customers:", tally.customer ?? 0, "· baristas:", tally.staff ?? 0, "· admins:", tally.admin ?? 0);
console.log("Presentation target → customers 5 · baristas 5 · admins 3  (13 total)");
if ((tally.customer ?? 0) < 5 || (tally.staff ?? 0) < 5 || (tally.admin ?? 0) < 3) {
  ok = false;
  console.log("⚠ Role counts below target — run seed-demo-users.mjs.");
}

// Branch coverage: every active branch should have at least one barista.
const { data: brAll } = await admin.from("branches").select("id, name, is_active");
const active = (brAll ?? []).filter((b) => b.is_active);
const { data: staffRows } = await admin.from("users").select("branch_id").eq("role", "staff");
const covered = new Set((staffRows ?? []).map((s) => s.branch_id).filter(Boolean));
const uncovered = active.filter((b) => !covered.has(b.id));
console.log(`\nBranch coverage → ${active.length - uncovered.length}/${active.length} active branches have a barista.`);
if (uncovered.length) {
  ok = false;
  console.log("⚠ Uncovered branches:", uncovered.map((b) => b.name).join(", "));
}

console.log("\nNote: passwords can't be verified from the service role — sign in from the app to confirm 123456.");
console.log(ok ? "\n✔ Accounts present with correct role/branch and full branch coverage." : "\n⚠ Some items need attention (see warnings above).");
process.exit(ok ? 0 : 1);
