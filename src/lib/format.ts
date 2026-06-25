import type { CartLine } from "@/types/models";

/** Format a number as Philippine Peso, e.g. 155 -> "₱155.00". */
export function peso(amount: number): string {
  return "₱" + (amount ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Unit price for a configured cart line (base + add-ons). */
export function lineUnitPrice(line: CartLine): number {
  const addOns = line.selectedOptions.reduce(
    (sum, o) => sum + o.additionalPrice * o.quantity,
    0,
  );
  return line.basePrice + addOns;
}

/** Total price for a configured cart line (unit * quantity). */
export function lineTotal(line: CartLine): number {
  return lineUnitPrice(line) * line.quantity;
}

/** Haversine distance between two coordinates, in kilometres. */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** "1.2 km away" / "850 m away" */
export function formatDistance(km: number | null): string {
  if (km == null) return "Distance unavailable";
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

/** Friendly pickup number ("#042") or null when not assigned (legacy orders). */
export function pickupNumber(o: { display_queue_number?: number | null }): string | null {
  return o.display_queue_number != null ? `#${String(o.display_queue_number).padStart(3, "0")}` : null;
}

/** Customer-facing order label: pickup number, else the canonical reference. */
export function pickupOrRef(o: {
  display_queue_number?: number | null;
  order_number?: string | null;
}): string {
  return pickupNumber(o) ?? o.order_number ?? "Order";
}

/** Short human label for an order status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Order placed";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready for pickup";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Emoji used as an image fallback, by category name. */
export function categoryEmoji(categoryName?: string | null): string {
  const c = (categoryName ?? "").toLowerCase();
  if (c.includes("pastr")) return "🥐";
  if (c.includes("non-coffee") || c.includes("milk")) return "🧋";
  if (c.includes("espresso")) return "☕";
  return "☕";
}

/** "~10–15 min" range label for an estimated prep time. */
export function formatEta(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null;
  if (min === max) return `~${min} min`;
  return `~${min}–${max} min`;
}

/** "around 4:20 PM" from an ISO ready estimate. */
export function formatReadyAround(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return `around ${t}`;
}

/** Format an ISO timestamp like "Jun 22, 2:45 PM". */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
