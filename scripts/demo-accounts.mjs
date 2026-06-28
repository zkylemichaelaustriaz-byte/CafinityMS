// =============================================================================
// Cafinity — presentation account list (EDIT THIS FILE).
//
// TARGET: 5 customers, 5 baristas, 3 administrators = 13 accounts.
//
// HOW MATCHING WORKS
//  - Accounts are matched by EMAIL (case-insensitive).
//  - If an email already exists, that account is REUSED: its name + avatar are
//    left untouched; only role / branch / (optionally) password are reconciled.
//  - If an email does not exist, a new demo account is CREATED, marked with
//    user_metadata.demo_seed = true so cleanup can find ONLY what it created.
//
// ⚠ NEAR-DUPLICATE EMAILS — run `node scripts/audit-demo.mjs` FIRST.
//    Some provided addresses look like typo variants of other accounts (e.g.
//    angell@ vs angel@, maria@xample vs maria@example). The audit reports any
//    near-matches so you can confirm the RIGHT account before this seeder runs —
//    it never creates a near-duplicate on its own.
//
// resetPassword:
//    true  → set this account's password to 123456 (intended for demo accounts).
//    false → leave the existing password untouched (use for any REAL account you
//            log into and do NOT want changed). The provided pre-existing accounts
//            default to false so you are never locked out; flip to true if you
//            want them standardised on 123456.
//
// firstName/lastName are used ONLY when an account is newly CREATED. For reused
// accounts the real name/avatar are preserved regardless of what's written here.
//
// branchName (baristas only): an existing branch name, or null to auto-assign
// one-per-branch across active branches.
// =============================================================================

export const DEMO_PASSWORD = "123456";

export const DEMO_ACCOUNTS = [
  // ---- CUSTOMERS (5) — 2 provided, 3 new -----------------------------------
  { email: "test@cafinity.com", firstName: "Demo", lastName: "Customer", role: "customer", resetPassword: false },
  { email: "bob@gmail.com",     firstName: "Bob",  lastName: "Reyes",    role: "customer", resetPassword: false },
  { email: "demo.customer3@cafinity.test", firstName: "Bea",  lastName: "Cruz",   role: "customer", resetPassword: true },
  { email: "demo.customer4@cafinity.test", firstName: "Noel", lastName: "Garcia", role: "customer", resetPassword: true },
  { email: "demo.customer5@cafinity.test", firstName: "Liza", lastName: "Santos", role: "customer", resetPassword: true },

  // ---- BARISTAS (5) — 2 provided, 3 new  (DB role "staff") -----------------
  { email: "angell@example.com", firstName: "Angeli", lastName: "Cruz",    role: "staff", branchName: null, resetPassword: false },
  { email: "calvin@gmail.com",   firstName: "Calvin", lastName: "Lim",     role: "staff", branchName: null, resetPassword: false },
  { email: "demo.barista3@cafinity.test", firstName: "Carlo", lastName: "Mendoza", role: "staff", branchName: null, resetPassword: true },
  { email: "demo.barista4@cafinity.test", firstName: "Joy",   lastName: "Tan",     role: "staff", branchName: null, resetPassword: true },
  { email: "demo.barista5@cafinity.test", firstName: "Paolo", lastName: "Reyes",   role: "staff", branchName: null, resetPassword: true },

  // ---- ADMINISTRATORS (3) — 2 provided, 1 new ------------------------------
  { email: "maria@xample.com", firstName: "Maria", lastName: "Dela Cruz", role: "admin", resetPassword: false },
  { email: "kyle@gmail.com",   firstName: "Kyle",  lastName: "Austria",   role: "admin", resetPassword: false },
  { email: "demo.admin3@cafinity.test", firstName: "Andrea", lastName: "Villanueva", role: "admin", resetPassword: true },
];
