// Local "pairs well with" mapping (lowercased product name → paired product name).
// A simple curated mapping — no recommendation engine needed. Admin-managed
// pairings could replace this later.
export const PRODUCT_PAIRINGS: Record<string, string> = {
  americano: "butter croissant",
  cappuccino: "chocolate muffin",
  "spanish latte": "butter croissant",
  "brown sugar latte": "chocolate muffin",
  "flat white": "butter croissant",
  "caramel macchiato": "chocolate muffin",
  "matcha latte": "cheesecake slice",
  "hot chocolate": "chocolate muffin",
  "strawberry milk": "cheesecake slice",
  "mango latte": "cheesecake slice",
  "ube latte": "cheesecake slice",
  "blueberry cloud latte": "blueberry cheesecake",
};

export function pairingFor(name?: string | null): string | null {
  if (!name) return null;
  return PRODUCT_PAIRINGS[name.trim().toLowerCase()] ?? null;
}
