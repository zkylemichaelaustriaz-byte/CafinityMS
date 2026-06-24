import type { CancellationRow } from "@/lib/api";

export interface CancelStats {
  count: number;
  rate: number; // 0..1, vs total orders in the period
  refunded: number; // ₱ refunded (simulated GCash)
  pendingRefunds: number; // cash to return at counter
  customer: number;
  staff: number;
  beforePay: number;
  afterPay: number;
  topReasons: { reason: string; count: number }[];
}

export function computeCancelStats(rows: CancellationRow[], totalOrders: number): CancelStats {
  let refunded = 0;
  let pendingRefunds = 0;
  let customer = 0;
  let staff = 0;
  let beforePay = 0;
  let afterPay = 0;
  const reasons = new Map<string, number>();

  for (const r of rows) {
    if (r.refund_status === "refunded") refunded += Number(r.refunded_amount || 0);
    if (r.refund_status === "refund_pending") pendingRefunds += 1;
    if (r.cancelled_by && r.cancelled_by === r.user_id) customer += 1;
    else staff += 1;
    if (r.refund_status === "none") beforePay += 1;
    else afterPay += 1;
    const reason = (r.cancellation_reason ?? "").trim() || "No reason provided";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const topReasons = Array.from(reasons.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    count: rows.length,
    rate: totalOrders ? rows.length / totalOrders : 0,
    refunded,
    pendingRefunds,
    customer,
    staff,
    beforePay,
    afterPay,
    topReasons,
  };
}
