CAFINITY — DEMO ACCOUNT PROVISIONING (LOCAL, SERVICE-ROLE)
==========================================================

These scripts run on YOUR machine only. They use the Supabase service-role key,
which must NEVER be placed in the Expo app, app.json, a public .env, or committed
to GitHub. The .gitignore already excludes scripts/.env (matched by ".env*").

WHAT THEY DO
------------
Provision the 9 live-presentation accounts: 4 customers, 3 baristas, 2 admins.
A 5th customer is registered live during the presentation (not seeded).
- Reuses existing accounts by email (keeps their name + avatar; reconciles role,
  branch, and — unless you opt out — the password 123456).
- Creates only the missing accounts (marked user_metadata.demo_seed = true).
- Assigns every barista an active branch (auto-distributed, or by branchName).

PREREQUISITES
-------------
1. Run the SQL migrations first (in Supabase SQL editor), in order, including:
      ... phase23 → phase24 → phase25 → phase26 → phase27_staff_branch.sql
   phase27 adds users.branch_id + set_staff_branch (needed for barista branches).
2. In Supabase Auth settings, allow these demo accounts to sign in (email
   confirmation is set automatically by the script via email_confirm).
3. Node 18+ and the app's dependencies installed (npm install in Cafinity/),
   so @supabase/supabase-js resolves.

SETUP
-----
  cd Cafinity
  cp scripts/.env.example scripts/.env      # then edit scripts/.env
  # Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CAFINITY_DEMO_SEED=true
  # (Optional) edit scripts/demo-accounts.mjs to reuse your existing emails.

RUN
---
  node scripts/seed-demo-users.mjs --dry-run   # preview — writes nothing
  node scripts/seed-demo-users.mjs             # apply
  node scripts/verify-demo.mjs                 # check roles / branches / counts
  node scripts/cleanup-demo.mjs --dry-run      # preview teardown (optional)
  node scripts/cleanup-demo.mjs                # delete ONLY seed-created accounts

SAFETY
------
- Idempotent: re-running matches by email; it updates, never duplicates.
- The --dry-run flag prints intended changes without writing.
- cleanup-demo only deletes accounts created by the seeder (demo_seed = true);
  it never removes existing/real accounts, orders, feedback, or inventory.
- requireEnv() refuses to run unless CAFINITY_DEMO_SEED=true.
- To NOT reset a real account's password, set resetPassword: false for it in
  scripts/demo-accounts.mjs.

NOT INCLUDED (separate, optional)
---------------------------------
Realistic 30-day activity (orders/feedback/rewards/inventory states) is a larger
seeder that backdates orders while keeping pricing/VAT/points consistent. Ask and
it can be added as scripts/seed-demo-activity.mjs (also idempotent + dry-run).
