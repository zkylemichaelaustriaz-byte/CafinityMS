import type { ReportFullOrder } from "@/lib/api";

// ---- Date-range presets -----------------------------------------------------

export type PresetKey =
  | "today"
  | "yesterday"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "custom";

export const PRESET_LABEL: Record<PresetKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  last_week: "Last week",
  month: "This month",
  last_month: "Last month",
  custom: "Custom range",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Inclusive `from`, exclusive `to` for a preset (local time). */
export function presetRange(key: Exclude<PresetKey, "custom">, now: Date = new Date()): {
  from: Date;
  to: Date;
} {
  const today = startOfDay(now);
  const mondayOffset = (now.getDay() + 6) % 7; // ISO week starts Monday
  switch (key) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 86_400_000) };
    case "yesterday":
      return { from: new Date(today.getTime() - 86_400_000), to: today };
    case "week": {
      const from = new Date(today.getTime() - mondayOffset * 86_400_000);
      return { from, to: new Date(from.getTime() + 7 * 86_400_000) };
    }
    case "last_week": {
      const thisWeek = new Date(today.getTime() - mondayOffset * 86_400_000);
      return { from: new Date(thisWeek.getTime() - 7 * 86_400_000), to: thisWeek };
    }
    case "month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "last_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
      };
  }
}

/** Parse a YYYY-MM-DD string to a local start-of-day Date, or null if invalid. */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** A short "Jun 1 – Jun 30, 2026" label for the chosen range (to exclusive). */
export function rangeLabel(from: Date, to: Date): string {
  const last = new Date(to.getTime() - 86_400_000); // inclusive last day
  const fmt = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const sameDay = startOfDay(from).getTime() === startOfDay(last).getTime();
  if (sameDay) return from.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(from)} – ${last.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
}

// ---- Summary computation ----------------------------------------------------

export interface ReportSummary {
  totalOrders: number;
  paidOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  scheduledOrders: number;
  gross: number;
  net: number;
  refunds: number;
  vat: number;
  tips: number;
  discounts: number;
  loyaltyCount: number;
  loyaltyAmount: number;
  aov: number;
  cashSales: number;
  gcashSales: number;
  byMethod: { method: string; amount: number; count: number }[];
  byBranch: { branchId: string; branchName: string; amount: number; count: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  byDay: { day: string; amount: number; count: number }[];
}

/** A paid, non-cancelled order counts toward sales (refunds deducted for net). */
function counts(o: ReportFullOrder): boolean {
  return o.payment_status === "paid" && o.status !== "cancelled";
}

const n = (v: unknown): number => Number(v ?? 0);

export function buildReportSummary(orders: ReportFullOrder[]): ReportSummary {
  let gross = 0,
    refunds = 0,
    vat = 0,
    tips = 0,
    discounts = 0,
    loyaltyCount = 0,
    loyaltyAmount = 0,
    paidOrders = 0,
    completedOrders = 0,
    cancelledOrders = 0,
    refundedOrders = 0,
    scheduledOrders = 0,
    cashSales = 0,
    gcashSales = 0;
  const method = new Map<string, { amount: number; count: number }>();
  const branch = new Map<string, { branchName: string; amount: number; count: number }>();
  const product = new Map<string, { qty: number; revenue: number }>();
  const day = new Map<string, { amount: number; count: number }>();

  for (const o of orders) {
    if (o.scheduled_for) scheduledOrders += 1;
    if (o.status === "cancelled") cancelledOrders += 1;
    if (o.refund_status === "refunded" || o.refund_status === "partially_refunded") {
      refunds += n(o.refunded_amount);
      refundedOrders += 1;
    }
    if (!counts(o)) continue;

    paidOrders += 1;
    if (o.status === "completed") completedOrders += 1;
    const total = n(o.total_amount);
    gross += total;
    vat += n(o.vat_amount);
    tips += n(o.tip_amount);
    discounts +=
      n(o.promo_discount) +
      n(o.loyalty_reward_discount) +
      n(o.statutory_discount) +
      (o.promo_discount || o.loyalty_reward_discount ? 0 : n(o.discount_amount));
    if (n(o.loyalty_reward_discount) > 0) {
      loyaltyCount += 1;
      loyaltyAmount += n(o.loyalty_reward_discount);
    }
    if (o.payment_method === "Cash") cashSales += total;
    else if (o.payment_method === "GCash") gcashSales += total;

    const m = method.get(o.payment_method) ?? { amount: 0, count: 0 };
    m.amount += total;
    m.count += 1;
    method.set(o.payment_method, m);

    const b = branch.get(o.branch_id) ?? { branchName: o.branch_name, amount: 0, count: 0 };
    b.amount += total;
    b.count += 1;
    branch.set(o.branch_id, b);

    const dayKey = o.created_at.slice(0, 10);
    const dy = day.get(dayKey) ?? { amount: 0, count: 0 };
    dy.amount += total;
    dy.count += 1;
    day.set(dayKey, dy);

    for (const it of o.order_items ?? []) {
      const p = product.get(it.product_name) ?? { qty: 0, revenue: 0 };
      p.qty += n(it.quantity);
      p.revenue += n(it.subtotal);
      product.set(it.product_name, p);
    }
  }

  return {
    totalOrders: orders.length,
    paidOrders,
    completedOrders,
    cancelledOrders,
    refundedOrders,
    scheduledOrders,
    gross,
    net: gross - refunds,
    refunds,
    vat,
    tips,
    discounts,
    loyaltyCount,
    loyaltyAmount,
    aov: paidOrders ? gross / paidOrders : 0,
    cashSales,
    gcashSales,
    byMethod: [...method.entries()]
      .map(([m, v]) => ({ method: m, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byBranch: [...branch.entries()]
      .map(([id, v]) => ({ branchId: id, ...v }))
      .sort((a, b) => b.amount - a.amount),
    topProducts: [...product.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 12),
    byDay: [...day.entries()].map(([d, v]) => ({ day: d, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}
