/** Turn a Supabase/auth error into a friendly, user-facing message. */
export function humanizeAuthError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login")) return "Incorrect email or password.";
  if (msg.includes("already registered") || msg.includes("user already"))
    return "That email is already registered. Try signing in instead.";
  if (msg.includes("password should be at least"))
    return "Password must be at least 6 characters.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email"))
    return "Please enter a valid email address.";
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to"))
    return "Network error. Check your connection and Supabase settings.";
  return raw || "Something went wrong. Please try again.";
}

/** Generic error message extractor. */
export function humanizeError(e: unknown, fallback = "Something went wrong."): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}
