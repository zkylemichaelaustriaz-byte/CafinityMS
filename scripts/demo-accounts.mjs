// =============================================================================
// Cafinity — presentation account list (EDIT THIS FILE).
//
// Target for the live demo: 4 customers, 3 baristas, 2 administrators (9 total).
// A 5th customer is registered live during the presentation — do NOT add it here.
//
// HOW MATCHING WORKS
//  - Accounts are matched by EMAIL (case-insensitive).
//  - If an email already exists, that account is REUSED: its name + avatar are
//    left untouched; only role / branch / password are reconciled.
//  - If an email does not exist, a new demo account is CREATED (marked with
//    user_metadata.demo_seed = true so cleanup can find it).
//
// TO REUSE YOUR EXISTING ACCOUNTS (e.g. Angel Locsin, Maria Dela Cruz, ...),
// replace the email below with that account's real email. The seeder will then
// reconcile it instead of creating a fictional one — existing names/avatars stay.
//
// resetPassword: set false for any real account you DON'T want reset to 123456.
// branchName (baristas only): must match an existing branch name, or set null to
// auto-distribute across active branches.
// =============================================================================

export const DEMO_PASSWORD = "123456";

export const DEMO_ACCOUNTS = [
  // ---- CUSTOMERS (4) -------------------------------------------------------
  { email: "demo.customer1@cafinity.test", firstName: "Liza", lastName: "Reyes", role: "customer", resetPassword: true },
  { email: "demo.customer2@cafinity.test", firstName: "Marco", lastName: "Santos", role: "customer", resetPassword: true },
  { email: "demo.customer3@cafinity.test", firstName: "Bea", lastName: "Cruz", role: "customer", resetPassword: true },
  { email: "demo.customer4@cafinity.test", firstName: "Noel", lastName: "Garcia", role: "customer", resetPassword: true },

  // ---- BARISTAS (3)  (DB role is "staff"; shown as "Barista" in the app) ----
  { email: "demo.barista1@cafinity.test", firstName: "Carlo", lastName: "Mendoza", role: "staff", branchName: null, resetPassword: true },
  { email: "demo.barista2@cafinity.test", firstName: "Joy", lastName: "Lim", role: "staff", branchName: null, resetPassword: true },
  { email: "demo.barista3@cafinity.test", firstName: "Paolo", lastName: "Tan", role: "staff", branchName: null, resetPassword: true },

  // ---- ADMINISTRATORS (2) --------------------------------------------------
  { email: "demo.admin1@cafinity.test", firstName: "Andrea", lastName: "Villanueva", role: "admin", resetPassword: true },
  { email: "demo.admin2@cafinity.test", firstName: "Diego", lastName: "Ramos", role: "admin", resetPassword: true },
];
