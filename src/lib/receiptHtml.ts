import { formatDateTime, peso, pickupNumber, statusLabel } from "@/lib/format";
import type { Order } from "@/types/models";

export interface ReceiptOptions {
  /** Header accent color (hex). */
  accent: string;
  /** Optional personal note/title under the wordmark. */
  headerNote: string;
  showCustomizations: boolean;
  showTip: boolean;
  showPoints: boolean;
  showTax: boolean;
}

export const RECEIPT_ACCENTS: { label: string; value: string }[] = [
  { label: "Espresso", value: "#5A3019" },
  { label: "Matcha", value: "#5E7A5A" },
  { label: "Caramel", value: "#A85A2A" },
  { label: "Berry", value: "#4C5FD5" },
  { label: "Rose", value: "#C2506E" },
];

export const DEFAULT_RECEIPT_OPTIONS: ReceiptOptions = {
  accent: RECEIPT_ACCENTS[0].value,
  headerNote: "",
  showCustomizations: true,
  showTip: true,
  showPoints: true,
  showTax: true,
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Computed receipt lines shared by the in-app preview and the PDF. */
export interface ReceiptLine {
  label: string;
  value: string;
  kind: "normal" | "discount";
}

export function receiptLines(order: Order, o: ReceiptOptions): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  lines.push({ label: "Merchandise subtotal", value: peso(order.subtotal), kind: "normal" });

  if (order.promo_discount) {
    const code =
      order.promo_code && !order.promo_code.startsWith("RWD-") ? ` (${order.promo_code})` : "";
    lines.push({ label: `Promo${code}`, value: `−${peso(order.promo_discount)}`, kind: "discount" });
  }
  if (order.loyalty_reward_discount) {
    lines.push({
      label: "Loyalty reward",
      value: `−${peso(order.loyalty_reward_discount)}`,
      kind: "discount",
    });
  }
  if (!order.promo_discount && !order.loyalty_reward_discount && order.discount_amount > 0) {
    lines.push({
      label: `Discount${order.promo_code ? ` (${order.promo_code})` : ""}`,
      value: `−${peso(order.discount_amount)}`,
      kind: "discount",
    });
  }
  if (o.showTax && order.vat_exempt_amount) {
    lines.push({
      label: "VAT exemption",
      value: `−${peso(order.vat_exempt_amount)}`,
      kind: "discount",
    });
  }
  if (order.statutory_discount) {
    lines.push({
      label: `${order.statutory_discount_type === "Senior" ? "Senior Citizen" : "PWD"} discount (20%)`,
      value: `−${peso(order.statutory_discount)}`,
      kind: "discount",
    });
  }
  if (order.service_fee) {
    lines.push({ label: "Service fee", value: peso(order.service_fee), kind: "normal" });
  }
  if (order.delivery_fee) {
    lines.push({ label: "Delivery fee", value: peso(order.delivery_fee), kind: "normal" });
  }
  if (o.showTip && order.tip_amount) {
    lines.push({ label: "Tip", value: peso(order.tip_amount), kind: "normal" });
  }
  if (o.showTax && order.vat_amount) {
    const rate = order.vat_rate_snapshot
      ? ` (${Math.round(order.vat_rate_snapshot * 100)}%)`
      : "";
    lines.push({ label: `VAT included${rate}`, value: peso(order.vat_amount), kind: "normal" });
  }
  return lines;
}

export function buildReceiptHtml(order: Order, o: ReceiptOptions): string {
  const accent = o.accent;
  const pickup = pickupNumber(order) ?? order.order_number ?? "—";
  const items = (order.order_items ?? [])
    .map((it) => {
      const custom =
        o.showCustomizations && it.order_item_customization.length > 0
          ? `<div class="opt">${esc(it.order_item_customization.map((c) => c.option_name).join(" · "))}</div>`
          : "";
      const note = it.item_notes ? `<div class="opt">Note: ${esc(it.item_notes)}</div>` : "";
      return `<div class="item">
        <div class="qty">${it.quantity}×</div>
        <div class="iname"><div class="nm">${esc(it.product_name)}</div><div class="opt">${esc(it.variant_name)}</div>${custom}${note}</div>
        <div class="iprice">${esc(peso(it.subtotal))}</div>
      </div>`;
    })
    .join("");

  const totals = receiptLines(order, o)
    .map(
      (l) =>
        `<div class="row"><span class="${l.kind === "discount" ? "disc" : ""}">${esc(l.label)}</span><span class="v ${l.kind === "discount" ? "disc" : ""}">${esc(l.value)}</span></div>`,
    )
    .join("");

  const points = o.showPoints
    ? `<div class="points">${
        order.points_state === "earned"
          ? `+${order.points_earned} points earned`
          : order.points_state === "reversed"
            ? "Points reversed"
            : `${order.points_earned} points pending`
      }</div>`
    : "";

  const note = o.headerNote.trim()
    ? `<div class="note">${esc(o.headerNote.trim())}</div>`
    : "";
  const branchAddr = order.branches?.address
    ? `<div class="baddr">${esc(order.branches.address)}</div>`
    : "";
  const paymentPending = order.payment_method === "Cash" && order.payment_status !== "paid";
  const payBlock = paymentPending
    ? `<div class="payrow pending">${esc(order.payment_method)} — Payment pending</div>`
    : `<div class="payrow"><span>${esc(order.payment_method)}</span><span>${esc(order.payment_status)}</span></div>`;

  // Theme-NEUTRAL paper: always warm ivory + espresso ink (so the on-screen
  // preview matches the exported PDF in light or dark mode). The chosen accent
  // is restrained — branding rule, wordmark, pickup number, points only.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #2A1D14; background: #ECE6DC; }
    .paper { max-width: 460px; margin: 0 auto; background: #FBF7EF; border: 1px solid #E5DBCD; border-radius: 14px; padding: 22px 0 6px; }
    .rule { height: 3px; background: ${accent}; margin: 0 24px 14px; border-radius: 2px; }
    .head { text-align: center; padding: 0 24px; }
    .brand { font-size: 23px; font-weight: 800; letter-spacing: .5px; color: ${accent}; }
    .tag { font-size: 12px; color: #8A7C6E; margin-top: 1px; }
    .branch { font-size: 13px; font-weight: 700; margin-top: 8px; }
    .baddr { font-size: 11px; color: #8A7C6E; margin-top: 1px; }
    .note { font-size: 12px; font-style: italic; color: #6B5E52; margin-top: 8px; }
    .divider { border-top: 1px dashed #DCD0BF; margin: 14px 24px; }
    .pickup { text-align: center; padding: 0 24px; }
    .pickup .label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #8A7C6E; }
    .pickup .num { font-size: 34px; font-weight: 800; color: ${accent}; line-height: 1.15; }
    .meta { padding: 0 24px; font-size: 12px; color: #6B5E52; }
    .meta .r { display: flex; justify-content: space-between; padding: 2px 0; }
    .meta .r b { color: #2A1D14; font-weight: 600; }
    .items { padding: 4px 24px 0; }
    .item { display: flex; padding: 9px 0; border-bottom: 1px solid #EFE7D9; }
    .qty { width: 30px; color: ${accent}; font-weight: 700; font-size: 14px; }
    .iname { flex: 1; padding-right: 8px; }
    .iname .nm { font-weight: 600; font-size: 14px; }
    .opt { font-size: 12px; color: #8A7C6E; margin-top: 2px; }
    .iprice { font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sum { padding: 12px 24px 0; }
    .row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; color: #4A3D31; }
    .row .v { font-variant-numeric: tabular-nums; }
    .disc { color: #2E7D52; }
    .grand { display: flex; justify-content: space-between; margin: 10px 24px 0; padding-top: 10px; border-top: 2px solid #2A1D14; font-size: 18px; font-weight: 800; }
    .grand .v { font-variant-numeric: tabular-nums; }
    .payrow { margin: 10px 24px 0; font-size: 12px; color: #6B5E52; display: flex; justify-content: space-between; }
    .payrow.pending { color: #B23B0E; font-weight: 700; justify-content: flex-start; }
    .points { margin: 14px 24px 0; text-align: center; font-size: 13px; font-weight: 700; color: ${accent}; background: ${accent}14; border-radius: 10px; padding: 8px; }
    .foot { text-align: center; font-size: 11px; color: #A89A8A; padding: 16px 24px 6px; }
  </style></head>
  <body><div class="paper">
    <div class="rule"></div>
    <div class="head">
      <div class="brand">Cafinity</div>
      <div class="tag">Coffee &amp; more</div>
      <div class="branch">${esc(order.branches?.name ?? "Cafinity")}</div>
      ${branchAddr}
      ${note}
    </div>
    <div class="divider"></div>
    <div class="pickup">
      <div class="label">Pickup number</div>
      <div class="num">${esc(pickup)}</div>
    </div>
    <div class="divider"></div>
    <div class="meta">
      ${order.order_number ? `<div class="r"><span>Reference</span><b>${esc(order.order_number)}</b></div>` : ""}
      <div class="r"><span>Date</span><b>${esc(formatDateTime(order.created_at))}</b></div>
      <div class="r"><span>Status</span><b>${esc(statusLabel(order.status))}</b></div>
    </div>
    <div class="items">${items}</div>
    <div class="sum">
      ${totals}
    </div>
    <div class="grand"><span>Total</span><span class="v">${esc(peso(order.total_amount))}</span></div>
    ${payBlock}
    ${points}
    <div class="foot">Thank you for choosing Cafinity ☕<br/>This is a digital receipt for your records.</div>
  </div></body></html>`;
}
