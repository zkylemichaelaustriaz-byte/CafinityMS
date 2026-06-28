import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { ReportFeedbackSummary, ReportFullOrder } from "@/lib/api";
import { peso } from "@/lib/format";
import type { ReportSummary } from "@/lib/reportData";

export interface ReportMeta {
  title: string;
  scopeLabel: string; // "All branches" or a branch name
  rangeLabel: string;
  generatedAt: string;
  generatedBy: string;
  role: string; // "Administrator" / "Barista"
}

// ---- helpers ----------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (v: number): string => Number(v ?? 0).toFixed(2);

function localDate(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ---- CSV --------------------------------------------------------------------

const BOM = "﻿"; // UTF-8 BOM for reliable spreadsheet import (peso, unicode)

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/** One row per order. Numeric money values (no symbol) for spreadsheet math. */
export function ordersCsv(orders: ReportFullOrder[]): string {
  const header = [
    "Order Number", "Date", "Time", "Scheduled Pickup", "Branch", "Status",
    "Payment Status", "Payment Method", "Items", "Subtotal", "Discount",
    "Loyalty Reward", "Tip", "VAT", "Total", "Refund", "Cancellation Reason",
  ];
  const lines = [csvRow(header)];
  for (const o of orders) {
    const items = (o.order_items ?? []).reduce((s, it) => s + Number(it.quantity ?? 0), 0);
    const discount =
      Number(o.promo_discount ?? 0) +
      Number(o.loyalty_reward_discount ?? 0) +
      Number(o.statutory_discount ?? 0) +
      (o.promo_discount || o.loyalty_reward_discount ? 0 : Number(o.discount_amount ?? 0));
    lines.push(
      csvRow([
        o.order_number ?? "",
        localDate(o.created_at),
        localTime(o.created_at),
        o.scheduled_for ? `${localDate(o.scheduled_for)} ${localTime(o.scheduled_for)}` : "",
        o.branch_name,
        o.status,
        o.payment_status,
        o.payment_method,
        items,
        money(o.subtotal),
        money(discount),
        money(o.loyalty_reward_discount),
        money(o.tip_amount),
        money(o.vat_amount),
        money(o.total_amount),
        money(Number(o.refunded_amount ?? 0)),
        o.cancellation_reason ?? "",
      ]),
    );
  }
  return BOM + lines.join("\r\n");
}

/** One row per sold product line. */
export function productSalesCsv(orders: ReportFullOrder[]): string {
  const header = [
    "Order Number", "Date", "Branch", "Product", "Variant", "Quantity",
    "Unit Price", "Line Subtotal", "Order Status", "Payment Method",
  ];
  const lines = [csvRow(header)];
  for (const o of orders) {
    for (const it of o.order_items ?? []) {
      lines.push(
        csvRow([
          o.order_number ?? "",
          localDate(o.created_at),
          o.branch_name,
          it.product_name,
          it.variant_name,
          Number(it.quantity ?? 0),
          money(it.unit_price),
          money(it.subtotal),
          o.status,
          o.payment_method,
        ]),
      );
    }
  }
  return BOM + lines.join("\r\n");
}

// ---- PDF (branded, always light/printable) ---------------------------------

function statRow(label: string, value: string): string {
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}

export function reportHtml(
  meta: ReportMeta,
  summary: ReportSummary,
  feedback: ReportFeedbackSummary | null,
  showBranchSection: boolean,
): string {
  const s = summary;

  const summaryGrid = [
    statRow("Gross sales", peso(s.gross)),
    statRow("Net sales (after refunds)", peso(s.net)),
    statRow("Completed orders", String(s.completedOrders)),
    statRow("Cancelled orders", String(s.cancelledOrders)),
    statRow("Refunded orders", String(s.refundedOrders)),
    statRow("Average order value", peso(s.aov)),
    statRow("Total discounts", peso(s.discounts)),
    statRow("Loyalty redemptions", `${s.loyaltyCount} (${peso(s.loyaltyAmount)})`),
    statRow("Total tips", peso(s.tips)),
    statRow("VAT included", peso(s.vat)),
    statRow("Cash sales", peso(s.cashSales)),
    statRow("GCash sales (simulated)", peso(s.gcashSales)),
    statRow("Scheduled orders", String(s.scheduledOrders)),
  ].join("");

  const dayRows = s.byDay
    .map(
      (d) =>
        `<tr><td>${esc(d.day)}</td><td class="r">${d.count}</td><td class="r">${esc(peso(d.amount))}</td></tr>`,
    )
    .join("");

  const productRows = s.topProducts
    .map(
      (p) =>
        `<tr><td>${esc(p.name)}</td><td class="r">${p.qty}</td><td class="r">${esc(peso(p.revenue))}</td></tr>`,
    )
    .join("");

  const methodRows = s.byMethod
    .map(
      (m) =>
        `<tr><td>${esc(m.method)}</td><td class="r">${m.count}</td><td class="r">${esc(peso(m.amount))}</td></tr>`,
    )
    .join("");

  const branchSection =
    showBranchSection && s.byBranch.length > 1
      ? `<h2>Branch performance</h2>
         <table><thead><tr><th>Branch</th><th class="r">Orders</th><th class="r">Avg order</th><th class="r">Sales</th></tr></thead>
         <tbody>${s.byBranch
           .map(
             (b) =>
               `<tr><td>${esc(b.branchName)}</td><td class="r">${b.count}</td><td class="r">${esc(peso(b.count ? b.amount / b.count : 0))}</td><td class="r">${esc(peso(b.amount))}</td></tr>`,
           )
           .join("")}</tbody></table>`
      : "";

  const feedbackSection =
    feedback && feedback.count > 0
      ? `<h2>Customer feedback</h2>
         <div class="kvwrap">
           ${statRow("Average rating", `${feedback.avg.toFixed(2)} / 5`)}
           ${statRow("Ratings received", String(feedback.count))}
         </div>
         ${
           Object.keys(feedback.tags).length
             ? `<p class="tags">${Object.entries(feedback.tags)
                 .sort((a, b) => b[1] - a[1])
                 .slice(0, 8)
                 .map(([t, c]) => `${esc(t)} (${c})`)
                 .join(" · ")}</p>`
             : ""
         }`
      : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    @page { margin: 28px; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0; color: #2A1D14; background: #FFFFFF; font-size: 12px; }
    .head { background: #FBF7EF; border-bottom: 3px solid #5A3019; padding: 18px 22px; }
    .brand { font-size: 22px; font-weight: 800; color: #5A3019; letter-spacing: .4px; }
    .title { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .meta { font-size: 11px; color: #6B5E52; margin-top: 6px; line-height: 1.5; }
    .meta b { color: #2A1D14; }
    .body { padding: 16px 22px 28px; }
    h2 { font-size: 13px; color: #5A3019; border-bottom: 1px solid #E5DBCD; padding-bottom: 4px; margin: 20px 0 10px; }
    .kvwrap { display: flex; flex-wrap: wrap; }
    .kv { width: 50%; display: flex; justify-content: space-between; padding: 5px 12px 5px 0; border-bottom: 1px solid #F0EAE0; }
    .kv .k { color: #6B5E52; }
    .kv .v { font-weight: 700; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead { display: table-header-group; }
    th { text-align: left; font-size: 11px; color: #6B5E52; border-bottom: 1.5px solid #D9CEBE; padding: 6px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #F0EAE0; font-variant-numeric: tabular-nums; }
    td.r, th.r { text-align: right; }
    tr { page-break-inside: avoid; }
    .tags { font-size: 11px; color: #6B5E52; }
    .foot { text-align: center; font-size: 10px; color: #A89A8A; padding: 14px 22px; border-top: 1px solid #EFE7D9; }
  </style></head>
  <body>
    <div class="head">
      <div class="brand">Cafinity</div>
      <div class="title">${esc(meta.title)}</div>
      <div class="meta">
        <div><b>Branch:</b> ${esc(meta.scopeLabel)} &nbsp;·&nbsp; <b>Period:</b> ${esc(meta.rangeLabel)}</div>
        <div><b>Generated:</b> ${esc(meta.generatedAt)} &nbsp;·&nbsp; <b>By:</b> ${esc(meta.generatedBy)} (${esc(meta.role)})</div>
      </div>
    </div>
    <div class="body">
      <h2>Executive summary</h2>
      <div class="kvwrap">${summaryGrid}</div>

      <h2>Sales by day</h2>
      ${dayRows ? `<table><thead><tr><th>Date</th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody>${dayRows}</tbody></table>` : `<p class="tags">No sales in this period.</p>`}

      <h2>Top products</h2>
      ${productRows ? `<table><thead><tr><th>Product</th><th class="r">Qty sold</th><th class="r">Sales</th></tr></thead><tbody>${productRows}</tbody></table>` : `<p class="tags">No items sold.</p>`}

      <h2>Payment methods</h2>
      ${methodRows ? `<table><thead><tr><th>Method</th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody>${methodRows}</tbody></table>` : `<p class="tags">No paid orders.</p>`}

      ${branchSection}
      ${feedbackSection}
    </div>
    <div class="foot">Cafinity sales &amp; operations report — figures use order-time recorded totals. Generated by the Cafinity app.</div>
  </body></html>`;
}

// ---- File creation + sharing ------------------------------------------------

async function shareUri(uri: string, mimeType: string, uti: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle });
}

export async function sharePdf(html: string, filename: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  const target = `${FileSystem.cacheDirectory}${filename}`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore — file may not exist
  }
  await FileSystem.moveAsync({ from: uri, to: target });
  await shareUri(target, "application/pdf", "com.adobe.pdf", filename);
  return target;
}

export async function shareCsv(content: string, filename: string): Promise<string> {
  const target = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(target, content, { encoding: FileSystem.EncodingType.UTF8 });
  await shareUri(target, "text/csv", "public.comma-separated-values-text", filename);
  return target;
}
