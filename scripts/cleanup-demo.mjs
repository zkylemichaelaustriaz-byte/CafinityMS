// Remove ONLY accounts this seeder created (user_metadata.demo_seed === true).
// Existing/real accounts (reused, unmarked) are NEVER touched.
// Run:  node scripts/cleanup-demo.mjs --dry-run   (preview)
//       node scripts/cleanup-demo.mjs             (delete seed-created accounts)
import { requireEnv, DRY_RUN } from "./lib/env.mjs";
import { getAdmin } from "./lib/admin.mjs";

requireEnv();
const admin = getAdmin();
const tag = DRY_RUN ? "[dry-run]" : "[apply]";

// Collect every seed-created auth user.
const seeded = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("✖ listUsers:", error.message);
    process.exit(1);
  }
  for (const u of data?.users ?? []) {
    if (u.user_metadata?.demo_seed === true) seeded.push(u);
  }
  if (!data || data.users.length < 200) break;
}

if (seeded.length === 0) {
  console.log(tag, "No seed-created accounts found (nothing marked demo_seed). Nothing to remove.");
  process.exit(0);
}

console.log(tag, `Found ${seeded.length} seed-created account(s):`);
for (const u of seeded) console.log("  -", u.email);

if (DRY_RUN) {
  console.log("\nNo changes were written. Re-run without --dry-run to delete these (profiles cascade).");
  process.exit(0);
}

let removed = 0;
for (const u of seeded) {
  // Deleting the auth user cascades public.users (FK on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.error("✖ delete", u.email, ":", error.message);
  else {
    removed++;
    console.log("removed", u.email);
  }
}
console.log(`\n✔ Removed ${removed}/${seeded.length} seed-created account(s). Existing accounts untouched.`);
