/**
 * RFC4122-ish v4 UUID generator for client-side idempotency keys.
 * Math.random is sufficient here — this is a deduplication token, not a secret.
 */
export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
