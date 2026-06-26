import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_ROLE } from "./env.mjs";

let _admin = null;

/** Service-role client. Created lazily AFTER requireEnv() has validated config. */
export function getAdmin() {
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

/** Find an auth user by email (case-insensitive). Paginates admin.listUsers. */
export async function findAuthUserByEmail(email) {
  const admin = getAdmin();
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (!data || data.users.length < 200) break; // last page
  }
  return null;
}
