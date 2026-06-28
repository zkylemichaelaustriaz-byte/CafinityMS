CAFINITY — DEMO PROVISIONING & DATA SEEDING (LOCAL, SERVICE-ROLE)
=================================================================

These scripts run on YOUR machine only. They use the Supabase service-role key,
which must NEVER be placed in the Expo app, app.json, a public .env, or committed
to GitHub. The .gitignore already excludes scripts/.env (matched by ".env*").

TARGET ACCOUNTS
---------------
5 customers · 5 baristas · 3 administrators = 13 accounts.
- Existing accounts are REUSED by email (name + avatar kept; role/branch/password
  reconciled). Missing accounts are CREATED, marked user_metadata.demo_seed = true
  so cleanup removes ONLY what the seeder created.
- Every barista is assigned exactly one active branch (one-per-branch).

PREREQUISITES
-------------
1. Run the SQL migrations first (Supabase SQL editor), in order, through:
      ... phase27_staff_branch.sql ... phase34_flexible_loyalty.sql
   then verify_migrations.sql. (phase27 adds users.branch_id; phase33/34 add
   product-info + flexible loyalty used by the activity seeder.)
2. Node 18+ and deps installed (npm install in Cafinity/) so @supabase/supabase-js
   resolves.

SETUP
-----
  cd Cafinity
  cp scripts/.env.example scripts/.env      # then edit scripts/.env
  # Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CAFINITY_DEMO_SEED=true

RUN ORDER (do these in sequence)
--------------------------------
  # 1. AUDIT FIRST — read-only. Resolves near-duplicate emails (angell/angel,
  #    maria@xample/maria@example) and shows current role counts + branches.
  node scripts/audit-demo.mjs

  #    -> If the audit flags a near-duplicate, fix the email in
  #       scripts/demo-accounts.mjs so it points at the REAL account, then re-audit.

  # 2. PROVISION users (dry-run, then apply)
  node scripts/seed-demo-users.mjs --dry-run
  node scripts/seed-demo-users.mjs

  # 3. VERIFY — role counts (5/5/3) + every active branch has a barista
  node scripts/verify-demo.mjs

SAFETY
------
- Idempotent: re-running matches by email; it updates, never duplicates.
- --dry-run prints intended changes without writing.
- requireEnv() refuses to run unless CAFINITY_DEMO_SEED=true.
- Existing accounts default to resetPassword:false (you won't be locked out);
  flip to true in demo-accounts.mjs to standardise them on 123456.
- cleanup-demo only deletes accounts created by the seeder (demo_seed = true);
  it never removes existing/real accounts.
- The demo password (123456) lives only in demo-accounts.mjs for the seeder; do
  not copy it into the DB, docs, or app config.

DATA SEEDING (Phases 9-12)
--------------------------
  node scripts/seed-demo-activity.mjs --dry-run   # 45-60 days of orders/feedback
  node scripts/seed-demo-activity.mjs             # apply (batch-marked, idempotent)
  node scripts/seed-demo-inventory.mjs --dry-run  # nonuniform branch stock states
  node scripts/seed-demo-inventory.mjs            # apply
  node scripts/verify-demo-data.mjs               # dashboard/report readiness check
  node scripts/cleanup-demo-data.mjs --dry-run    # preview teardown of seeded data
  node scripts/cleanup-demo-data.mjs              # remove ONLY batch-marked records
