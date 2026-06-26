// Single rule for inventory stock status so the dashboard, inventory page, and
// any future surface don't drift apart.

export type StockStatus = "healthy" | "low" | "critical" | "out";

export function stockStatus(stock: number, threshold: number, available = true): StockStatus {
  if (!available || stock <= 0) return "out";
  if (threshold > 0 && stock <= Math.ceil(threshold / 2)) return "critical";
  if (stock <= threshold) return "low";
  return "healthy";
}

export const STOCK_META: Record<
  StockStatus,
  { label: string; tone: "green" | "amber" | "red" | "gray"; icon: string }
> = {
  healthy: { label: "Healthy", tone: "green", icon: "checkmark-circle-outline" },
  low: { label: "Low stock", tone: "amber", icon: "alert-circle-outline" },
  critical: { label: "Critical", tone: "red", icon: "warning-outline" },
  out: { label: "Out of stock", tone: "red", icon: "close-circle-outline" },
};
