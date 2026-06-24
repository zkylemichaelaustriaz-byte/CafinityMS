import type { MenuProduct } from "@/types/models";

type BadgeTone = "brand" | "green" | "red" | "amber" | "gray" | "blue";

/**
 * The single most relevant status badge for an in-stock product (or null).
 * Precedence keeps cards uncluttered: New → Few left → Featured.
 */
export function getProductBadge(p: MenuProduct): { label: string; tone: BadgeTone } | null {
  if (p.collection_key) return { label: "Seasonal", tone: "brand" };
  if (p.isNew) return { label: "New", tone: "green" };
  if (p.lowStock) return { label: "Few left", tone: "amber" };
  if (p.is_featured) return { label: "Featured", tone: "amber" };
  return null;
}
