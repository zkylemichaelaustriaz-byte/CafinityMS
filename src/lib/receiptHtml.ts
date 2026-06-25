import { formatDateTime, peso, pickupNumber } from "@/lib/format";
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
      return `<tr>
        <td class="qty">${it.quantity}×</td>
        <td class="name">${esc(it.product_name)}<div class="opt">${esc(it.variant_name)}</div>${custom}${note}</td>
        <td class="price">${esc(peso(it.subtotal))}</td>
      </tr>`;
    })
    .join("");

  const totals = receiptLines(order, o)
    .map(
      (l) =>
        `<div class="row"><span class="${l.kind === "discount" ? "disc" : ""}">${esc(l.label)}</span><span class="${l.kind === "discount" ? "disc" : ""}">${esc(l.value)}</span></div>`,
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 28px; color: #231711; background: #fff; }
    .paper { max-width: 460px; margin: 0 auto; border: 1px solid #eee; border-radius: 16px; overflow: hidden; }
    .head { background: ${accent}; color: #fff; padding: 22px 24px; text-align: center; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
    .tag { font-size: 12px; opacity: 0.85; margin-top: 2px; }
    .note { font-size: 13px; margin-top: 8px; font-style: italic; opacity: 0.95; }
    .pickup { padding: 16px 24px; text-align: center; border-bottom: 1px dashed #ddd; }
    .pickup .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #998; }
    .pickup .num { font-size: 34px; font-weight: 800; color: ${accent}; }
    .meta { padding: 14px 24px; font-size: 12px; color: #776; border-bottom: 1px dashed #ddd; }
    .meta div { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px 24px; vertical-align: top; font-size: 14px; border-bottom: 1px solid #f3f0ec; }
    .qty { width: 34px; color: ${accent}; font-weight: 700; }
    .name { font-weight: 600; }
    .opt { font-weight: 400; font-size: 12px; color: #998; margin-top: 2px; }
    .price { text-align: right; white-space: nowrap; font-weight: 600; }
    .totals { padding: 14px 24px; }
    .row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; color: #443; }
    .disc { color: #2e7d52; }
    .grand { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; margin-top: 8px; padding-top: 10px; border-top: 2px solid #231711; }
    .pay { padding: 4px 24px 14px; font-size: 12px; color: #776; display: flex; justify-content: space-between; }
    .points { margin: 0 24px 18px; text-align: center; font-size: 13px; font-weight: 700; color: ${accent}; background: ${accent}14; border-radius: 10px; padding: 8px; }
    .foot { text-align: center; font-size: 11px; color: #aa9; padding: 0 24px 22px; }
  </style></head>
  <body><div class="paper">
    <div class="head">
      <div class="brand">Cafinity</div>
      <div class="tag">Coffee &amp; more</div>
      ${note}
    </div>
    <div class="pickup">
      <div class="label">Pickup number</div>
      <div class="num">${esc(pickup)}</div>
    </div>
    <div class="meta">
      ${order.order_number ? `<div>Ref ${esc(order.order_number)}</div>` : ""}
      <div>${esc(formatDateTime(order.created_at))}</div>
      <div>Pickup at ${esc(order.branches?.name ?? "your branch")}</div>
    </div>
    <table>${items}</table>
    <div class="totals">
      ${totals}
      <div class="grand"><span>Total</span><span>${esc(peso(order.total_amount))}</span></div>
    </div>
    <div class="pay"><span>${esc(order.payment_method)}</span><span>${esc(order.payment_status)}</span></div>
    ${points}
    <div class="foot">Thank you for choosing Cafinity ☕<br/>This is a digital receipt for your records.</div>
  </div></body></html>`;
}
