// src/lib/invoice-pdf.ts
//
// PDF for the subscription / manual invoices the super admin raises (admin
// Invoices page). The customer order invoice lives in src/lib/invoice.ts; this
// one is billed by the platform to an organization/outlet, so it has its own
// layout: bill-to block, line items, tax breakdown, paid / balance.

import { jsPDF } from "jspdf";
import { format } from "date-fns";

// jsPDF's built-in helvetica has no glyph for the rupee sign, so the PDF uses
// an ASCII "Rs" rather than the ₹ the screens show.
const rs = (n: number) =>
  `Rs ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtD = (d?: string | Date | null) => (d ? format(new Date(d), "dd MMM yyyy") : "-");

export type InvoicePdfLine = { description: string; quantity: number; unit_price: number };

export type InvoicePdfData = {
  invoice_number?: string | null;
  status: string;
  issued_at?: string | null;
  due_date?: string | null;
  organization_name?: string | null;
  outlet_name?: string | null;
  billing_address?: string | null;
  gst_number?: string | null;
  description?: string | null;
  notes?: string | null;
  plan?: string | null;
  billing_cycle?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  line_items: InvoicePdfLine[];
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  amount_paid: number;
  balance: number;
  logo_url?: string | null;
};

const LOGO_PT = 44;

// Same approach as src/lib/invoice.ts: fetch the bytes, downscale to what is
// actually printed and flatten to JPEG so the PDF stays small.
async function loadLogo(url?: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, (LOGO_PT * 4) / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return { data: canvas.toDataURL("image/jpeg", 0.82), w, h };
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft: "DRAFT", issued: "ISSUED", pending: "PENDING", pending_approval: "AWAITING APPROVAL",
  paid: "PAID", partially_paid: "PARTIALLY PAID", overdue: "OVERDUE", cancelled: "CANCELLED",
  rejected: "REJECTED", free_trial: "FREE TRIAL",
};

export async function buildInvoicePdf(d: InvoicePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48, R = 547;
  let y = 52;

  const logo = await loadLogo(d.logo_url);
  if (logo) {
    const h = Math.min(LOGO_PT, (logo.h / logo.w) * LOGO_PT);
    try { doc.addImage(logo.data, "JPEG", L, y - 20, LOGO_PT, h, undefined, "FAST"); } catch { /* ignore bad image */ }
  }
  const brandX = logo ? L + LOGO_PT + 10 : L;
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(20).text("PlateOS", brandX, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120).text("Restaurant ordering platform", brandX, y + 13);

  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(16).text("INVOICE", R, y, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(90)
    .text(STATUS_LABEL[d.status] ?? d.status.toUpperCase(), R, y + 14, { align: "right" });
  y += 36;
  doc.setDrawColor(225).line(L, y, R, y); y += 20;

  // Number / dates
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11)
    .text(`Invoice # ${d.invoice_number || "(draft)"}`, L, y);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Issue date: ${fmtD(d.issued_at)}`, R, y, { align: "right" });
  y += 14;
  doc.text(`Due date: ${fmtD(d.due_date)}`, R, y, { align: "right" });
  if (d.plan) {
    doc.text(`Plan: ${d.plan}${d.billing_cycle ? ` (${d.billing_cycle})` : ""}`, L, y);
  }
  y += 14;
  if (d.period_start || d.period_end) {
    doc.text(`Subscription period: ${fmtD(d.period_start)} to ${fmtD(d.period_end)}`, L, y);
    y += 14;
  }
  y += 10;

  // Bill to
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(10).text("Bill to", L, y); y += 14;
  doc.setFont("helvetica", "normal").setTextColor(40);
  const billLines: string[] = [];
  if (d.organization_name) billLines.push(d.organization_name);
  if (d.outlet_name) billLines.push(`Outlet: ${d.outlet_name}`);
  for (const l of billLines) {
    for (const w of doc.splitTextToSize(l, R - L) as string[]) { doc.text(w, L, y); y += 13; }
  }
  if (d.billing_address) {
    for (const w of doc.splitTextToSize(d.billing_address, 320) as string[]) { doc.text(w, L, y); y += 13; }
  }
  if (d.gst_number) { doc.text(`GSTIN: ${d.gst_number}`, L, y); y += 13; }
  y += 12;

  // Line items
  const COL = { desc: L + 4, qty: 360, price: 450, amt: R };
  const header = () => {
    doc.setFillColor(243, 244, 246).rect(L, y - 12, R - L, 20, "F");
    doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(9);
    doc.text("Description", COL.desc, y);
    doc.text("Qty", COL.qty, y, { align: "right" });
    doc.text("Unit price", COL.price, y, { align: "right" });
    doc.text("Amount", COL.amt - 4, y, { align: "right" });
    y += 18;
    doc.setFont("helvetica", "normal").setFontSize(10);
  };
  header();
  const items = d.line_items.length
    ? d.line_items
    : [{ description: d.description || d.plan || "Invoice", quantity: 1, unit_price: d.total }];
  for (const it of items) {
    const lines = doc.splitTextToSize(it.description || "-", 280) as string[];
    const rowH = lines.length * 12 + 6;
    if (y + rowH > 760) { doc.addPage(); y = 64; header(); }
    doc.setTextColor(30).text(lines, COL.desc, y);
    doc.text(String(it.quantity), COL.qty, y, { align: "right" });
    doc.text(rs(it.unit_price), COL.price, y, { align: "right" });
    doc.text(rs(it.quantity * it.unit_price), COL.amt - 4, y, { align: "right" });
    y += rowH;
    doc.setDrawColor(238).line(L, y - 8, R, y - 8);
  }

  // Totals
  if (y > 640) { doc.addPage(); y = 64; }
  y += 8;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 11 : 10).setTextColor(bold ? 0 : 60);
    doc.text(label, 450, y, { align: "right" });
    doc.text(value, R - 4, y, { align: "right" });
    y += bold ? 18 : 15;
  };
  row("Subtotal", rs(d.subtotal));
  if (d.discount > 0) row("Discount", `- ${rs(d.discount)}`);
  if (d.cgst > 0) row("CGST", rs(d.cgst));
  if (d.sgst > 0) row("SGST", rs(d.sgst));
  if (d.igst > 0) row("IGST", rs(d.igst));
  doc.setDrawColor(200).line(360, y - 8, R, y - 8);
  y += 4;
  row("Grand total", rs(d.total), true);
  row("Amount paid", rs(d.amount_paid));
  row("Balance due", rs(d.balance), true);

  // Notes
  const notes = [d.description && d.line_items.length ? d.description : null, d.notes].filter(Boolean) as string[];
  if (notes.length) {
    y += 14;
    if (y > 740) { doc.addPage(); y = 64; }
    doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(10).text("Notes", L, y); y += 14;
    doc.setFont("helvetica", "normal").setTextColor(80);
    for (const w of doc.splitTextToSize(notes.join("\n"), R - L) as string[]) {
      if (y > 790) { doc.addPage(); y = 64; }
      doc.text(w, L, y); y += 12;
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(160);
    doc.text("Generated by PlateOS. This is a computer generated invoice.", L, 815);
    doc.text(`Page ${p} of ${pages}`, R, 815, { align: "right" });
  }
  return doc;
}

export const invoiceFileName = (d: Pick<InvoicePdfData, "invoice_number">) =>
  `Invoice-${d.invoice_number || "draft"}.pdf`;

export async function downloadSubscriptionInvoicePdf(d: InvoicePdfData) {
  const doc = await buildInvoicePdf(d);
  doc.save(invoiceFileName(d));
}

/** Prints through a hidden iframe; falls back to opening the PDF in a new tab. */
export async function printSubscriptionInvoicePdf(d: InvoicePdfData) {
  const doc = await buildInvoicePdf(d);
  const url = URL.createObjectURL(doc.output("blob"));
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(frame);
}
