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

export type ErrorKind = "offline" | "timeout" | "auth" | "server" | "validation" | "unknown";

/** Classify an error so callers can differentiate offline vs server vs timeout. */
export function classifyError(e: unknown): ErrorKind {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (!raw) return "unknown";
  if (/network request failed|fetch failed|network error|connection|offline|enotfound|unreachable/.test(raw))
    return "offline";
  if (/timeout|timed out|etimedout|aborted/.test(raw)) return "timeout";
  if (/jwt|not authorized|unauthor|permission denied|row-level security|rls|forbidden|401|403/.test(raw))
    return "auth";
  if (/invalid|required|must be|too (long|short|many)|out of range|constraint/.test(raw))
    return "validation";
  if (/5\d\d|server|internal|unavailable|pgrst|database/.test(raw)) return "server";
  return "unknown";
}

/** Generic error message extractor with offline/timeout/auth differentiation. */
export function humanizeError(e: unknown, fallback = "Something went wrong."): string {
  switch (classifyError(e)) {
    case "offline":
      return "No internet connection. Check your connection and try again.";
    case "timeout":
      return "The request timed out. Please try again.";
    case "auth":
      return "Your session may have expired, or you don't have access. Please sign in again.";
    default:
      break;
  }
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}
