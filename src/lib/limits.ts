// Shared input limits — single source so the client never lets a value through
// that the server (place_order) would reject.

/** Max quantity per cart line. Mirrors the server check (1–20 in place_order). */
export const MAX_ITEM_QUANTITY = 20;
