import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Loads scripts/.env (gitignored) without any dependency. Real environment
// variables already set take precedence.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const DEMO_ENABLED = process.env.CAFINITY_DEMO_SEED === "true";
export const DRY_RUN = process.argv.includes("--dry-run");

/** Fail fast unless this is clearly a confirmed demo environment. */
export function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error(
      "✖ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "  Put them in scripts/.env (see scripts/.env.example). NEVER commit this file.",
    );
    process.exit(1);
  }
  if (!DEMO_ENABLED) {
    console.error(
      "✖ Refusing to run. Set CAFINITY_DEMO_SEED=true in scripts/.env to confirm\n" +
        "  this is an isolated classroom-demo project (123456 passwords will be set).",
    );
    process.exit(1);
  }
}
