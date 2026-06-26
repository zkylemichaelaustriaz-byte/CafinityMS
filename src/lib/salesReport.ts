import type { ReportOrder } from "@/lib/api";

// What counts toward sales: PAID and NOT cancelled. This excludes failed/unpaid
// payments, pending cash orders, and cancelled orders from revenue. Refunds are
// tracked separately and deducted to get net.

export interface SalesReport {
  gross: number; // paid, non-cancelled order totals
  refunds: number; // refunded amount (refunded / partially refunded)
  net: number; // gross − refunds
  vat: number; // VAT included in gross
  paidOrders: number; // counted orders
  completedOrders: number;
  cancelledOrders: number;
  aov: number; // gross / paidOrders
  tips: number;
  discounts: number; // promo + loyalty + statutory (+ legacy)
  loyaltyCount: number; // orders that used a loyalty voucher
  loyaltyAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
  byBranch: { branchId: string; amount: number; count: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
}

function counts(o: ReportOrder): boolean {
  return o.payment_status === "paid" && o.status !== "cancelled";
}

export function computeSalesReport(
  orders: ReportOrder[],
  fromTs: number,
  toTs: number,
  branchId: string | null,
): SalesReport {
  const inScope = orders.filter((o) => {
    const t = new Date(o.created_at).getTime();
    return t >= fromTs && t < toTs && (!branchId || o.branch_id === branchId);
  });

  let gross = 0;
  let refunds = 0;
  let vat = 0;
  let tips = 0;
  let discounts = 0;
  let loyaltyCount = 0;
  let loyaltyAmount = 0;
  let paidOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  const method = new Map<string, { amount: number; count: number }>();
  const branch = new Map<string, { amount: number; count: number }>();
  const product = new Map<string, { qty: number; revenue: number }>();

  for (const o of inScope) {
    if (o.status === "cancelled") cancelledOrders += 1;
    // Refunds can apply to cancelled orders — count them regardless.
    if (o.refund_status === "refunded" || o.refund_status === "partially_refunded") {
      refunds += Number(o.refunded_amount ?? 0);
    }
    if (!counts(o)) continue;

    paidOrders += 1;
    if (o.status === "completed") completedOrders += 1;
    gross += Number(o.total_amount ?? 0);
    vat += Number(o.vat_amount ?? 0);
    tips += Number(o.tip_amount ?? 0);
    const disc =
      Number(o.promo_discount ?? 0) +
      Number(o.loyalty_reward_discount ?? 0) +
      Number(o.statutory_discount ?? 0) +
      // legacy single discount only when the itemized ones are absent
      (o.promo_discount || o.loyalty_reward_discount ? 0 : Number(o.discount_amount ?? 0));
    discounts += disc;
    if (Number(o.loyalty_reward_discount ?? 0) > 0) {
      loyaltyCount += 1;
      loyaltyAmount += Number(o.loyalty_reward_discount);
    }

    const m = method.get(o.payment_method) ?? { amount: 0, count: 0 };
    m.amount += Number(o.total_amount ?? 0);
    m.count += 1;
    method.set(o.payment_method, m);

    const b = branch.get(o.branch_id) ?? { amount: 0, count: 0 };
    b.amount += Number(o.total_amount ?? 0);
    b.count += 1;
    branch.set(o.branch_id, b);

    for (const it of o.order_items ?? []) {
      const p = product.get(it.product_name) ?? { qty: 0, revenue: 0 };
      p.qty += Number(it.quantity ?? 0);
      p.revenue += Number(it.subtotal ?? 0);
      product.set(it.product_name, p);
    }
  }

  return {
    gross,
    refunds,
    net: gross - refunds,
    vat,
    paidOrders,
    completedOrders,
    cancelledOrders,
    aov: paidOrders ? gross / paidOrders : 0,
    tips,
    discounts,
    loyaltyCount,
    loyaltyAmount,
    byMethod: [...method.entries()]
      .map(([m, v]) => ({ method: m, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byBranch: [...branch.entries()]
      .map(([id, v]) => ({ branchId: id, ...v }))
      .sort((a, b) => b.amount - a.amount),
    topProducts: [...product.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8),
  };
}
