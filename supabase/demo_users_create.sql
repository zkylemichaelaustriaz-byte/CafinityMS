-- =============================================================================
-- DEMO: CREATE login accounts in SQL  (Supabase SQL editor)
-- =============================================================================
-- ⚠ This writes directly into auth.users / auth.identities. That is NOT the
--   officially supported way to create users (the Auth Admin API is). It works
--   fine for an ISOLATED CLASSROOM DEMO but can break across GoTrue versions and
--   must NEVER be used in production. Prefer registering via the app + the safe
--   demo_users_roles_branches.sql. Use this only if you want pure SQL.
--
-- Creates the 9 demo accounts with password 123456, confirmed email, correct
-- role, and round-robin barista branches. Idempotent: skips emails that already
-- exist (and only resets their password). pgcrypto provides crypt()/gen_salt();
-- if you get "function crypt does not exist", change crypt/gen_salt to
-- extensions.crypt/extensions.gen_salt below.

do $$
declare
  d        record;
  v_uid    uuid;
  v_active uuid[];
  v_bidx   int := 0;
begin
  create extension if not exists pgcrypto;
  select array_agg(id order by name) into v_active from public.branches where is_active;

  for d in
    select * from (values
      ('demo.customer1@cafinity.test','Liza','Reyes','customer'),
      ('demo.customer2@cafinity.test','Marco','Santos','customer'),
      ('demo.customer3@cafinity.test','Bea','Cruz','customer'),
      ('demo.customer4@cafinity.test','Noel','Garcia','customer'),
      ('demo.barista1@cafinity.test','Carlo','Mendoza','staff'),
      ('demo.barista2@cafinity.test','Joy','Lim','staff'),
      ('demo.barista3@cafinity.test','Paolo','Tan','staff'),
      ('demo.admin1@cafinity.test','Andrea','Villanueva','admin'),
      ('demo.admin2@cafinity.test','Diego','Ramos','admin')
    ) as t(email, first_name, last_name, role)
  loop
    select id into v_uid from auth.users where lower(email) = lower(d.email);

    if v_uid is null then
      v_uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        d.email, crypt('123456', gen_salt('bf')), now(),
        jsonb_build_object('provider','email','providers', array['email']),
        jsonb_build_object('first_name', d.first_name, 'last_name', d.last_name, 'demo_seed', true),
        now(), now()
      );

      -- identity row (remove the `id` column below if your auth.identities has none)
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', d.email),
        'email', now(), now(), now()
      );
    else
      -- existing account → just (re)set the demo password
      update auth.users
         set encrypted_password = crypt('123456', gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now())
       where id = v_uid;
    end if;

    -- profile (the trigger usually creates it; this guarantees role is set,
    -- and never overwrites an existing real name)
    insert into public.users (id, email, first_name, last_name, role)
    values (v_uid, d.email, d.first_name, d.last_name, d.role::user_role)
    on conflict (id) do update set role = excluded.role;

    if d.role = 'staff' and v_active is not null and array_length(v_active,1) > 0 then
      update public.users
         set branch_id = v_active[(v_bidx % array_length(v_active,1)) + 1]
       where id = v_uid and branch_id is null;
      v_bidx := v_bidx + 1;
    end if;
  end loop;
end $$;

-- Check
select email, role, branch_id from public.users
 where lower(email) like 'demo.%@cafinity.test' order by role, email;
