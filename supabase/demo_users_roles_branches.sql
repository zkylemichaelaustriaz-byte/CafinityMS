-- =============================================================================
-- DEMO: set roles + assign barista branches  (SAFE — paste in Supabase SQL editor)
-- =============================================================================
-- Use this AFTER the 9 demo accounts already exist as login users. The easiest
-- safe way to create them is to REGISTER each one through the app's Sign-Up
-- screen with password 123456 (that uses Supabase Auth correctly and the
-- handle_new_user trigger makes the profile row). Then run this to fix roles +
-- branches. Touches ONLY public.users — never auth.users. Idempotent.
--
-- Requires phase27_staff_branch.sql (adds users.branch_id) to have been run.
-- Edit the email lists below to match your accounts.

-- 1) Roles ---------------------------------------------------------------------
update public.users set role = 'admin'
 where lower(email) in ('demo.admin1@cafinity.test', 'demo.admin2@cafinity.test');

update public.users set role = 'staff'   -- "Barista" in the app
 where lower(email) in ('demo.barista1@cafinity.test', 'demo.barista2@cafinity.test', 'demo.barista3@cafinity.test');

update public.users set role = 'customer'
 where lower(email) in ('demo.customer1@cafinity.test', 'demo.customer2@cafinity.test',
                        'demo.customer3@cafinity.test', 'demo.customer4@cafinity.test');

-- 2) Assign each UNASSIGNED barista to an active branch (round-robin) ----------
with active as (
  select id, row_number() over (order by name) rn from public.branches where is_active
),
baristas as (
  select id, row_number() over (order by email) rn
  from public.users where role = 'staff' and branch_id is null
)
update public.users u
   set branch_id = a.id
  from baristas b
  join active a
    on ((b.rn - 1) % (select count(*) from active)) + 1 = a.rn
 where u.id = b.id;

-- 3) Check ---------------------------------------------------------------------
select role, count(*) from public.users group by role order by role;
select email, role, branch_id from public.users
 where lower(email) like 'demo.%@cafinity.test' order by role, email;
