/** Lightweight, dependency-free form validators shared by the auth screens. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Returns a human label for password strength, or null if too short to score. */
export function passwordStrength(value: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
} {
  if (value.length < 6) return { score: 0, label: "Too short" };
  let score = 1;
  if (value.length >= 10) score += 1;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score += 1;
  const clamped = Math.min(3, score) as 0 | 1 | 2 | 3;
  return { score: clamped, label: ["Too short", "Weak", "Good", "Strong"][clamped] };
}
