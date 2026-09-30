// src/lib/invoice.ts
//
// One invoice generator, shared by the customer status page and the staff
// order-history screen. Both used to need their own copy; the copies drifted,
// which is how one of them ended up embedding a full-resolution logo and
// producing a 57 MB PDF. Change the layout here and both screens follow.

import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { mergeOrderItems } from "@/lib/order-items";

// jsPDF's built-in helvetica has no glyph for the rupee sign, so the PDF uses
// an ASCII "Rs" rather than the ₹ the screens show.
const rs = (n: number) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// The logo is printed 56pt wide. Rasterising the source at its native size is
// what made the invoice tens of megabytes: a 3000px logo became a multi-MB
// data URL that jsPDF then embedded uncompressed. 4x the printed width is
// ~300dpi at that size — past this it is bytes nobody can see.
const LOGO_PT = 56;
const LOGO_PX = LOGO_PT * 4;

export type InvoiceTenant = {
  name?: string | null;
  slogan?: string | null;
  address?: string | null;
  city?: string | null;
  gst_number?: string | null;
  logo_url?: string | null;
} | null | undefined;

/**
 * Loads a remote logo into a data URL so jsPDF can embed it. Fetches the
 * bytes directly (instead of drawing a cross-origin <img> onto a canvas) so
 * a storage host that omits permissive CORS headers can't taint the canvas
 * and silently drop the logo; this also normalises any source format
 * (PNG/JPEG/WEBP) to the one format below, which is what jsPDF is told to
 * expect at the call site.
 *
 * The bitmap is downscaled to the size it will actually print at and
 * re-encoded as JPEG, which is what keeps the finished PDF in the tens of KB.
 * JPEG carries no alpha channel, so a transparent source is flattened onto
 * white first — if a tenant ever ships a white or very light logo mark on
 * transparency it would vanish against that, and this should go back to
 * "image/png" / "PNG" (the downscale alone still does most of the work).
 */
async function loadLogo(
  url?: string | null,
): Promise<{ data: string; fmt: "JPEG"; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const scale = Math.min(1, LOGO_PX / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    return { data: canvas.toDataURL("image/jpeg", 0.82), fmt: "JPEG", w, h };
  } catch {
    return null;
  }
}

/**
 * Builds the invoice and hands it to the browser as a download.
 *
 * `rawItems` are order_items rows as stored — merging happens here, so callers
 * pass whatever they already hold and don't each have to remember to do it.
 * `tenant` is optional: without it the header falls back to a plain "Invoice"
 * rather than the restaurant's name and GST details.
 */
export async function downloadInvoicePdf(order: any, rawItems: any[], tenant?: InvoiceTenant) {
  if (!order) return;

  // The invoice reads the same way the order sheet does: one row per dish. Qty
  // and Amount both follow the merged quantity, so the rows still total to the
  // subtotal printed underneath them.
  const invoiceLines = mergeOrderItems(rawItems || []);
  const ten = tenant;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;

  const logo = await loadLogo(ten?.logo_url);
  if (logo) {
    const size = LOGO_PT;
    const h = Math.min(size, (logo.h / logo.w) * size);
    // "FAST" is jsPDF's compression flag — without it the image bytes go in
    // as-is, which is the other half of why this file used to be so large.
    try { doc.addImage(logo.data, logo.fmt, 491, y - 22, size, h, undefined, "FAST"); } catch { /* ignore bad image */ }
  }

  doc.setFont("helvetica", "bold").setFontSize(18).text(ten?.name || "Invoice", 48, y); y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
  if (ten?.slogan) { doc.text(ten.slogan, 48, y); y += 14; }
  const addr = [ten?.address, ten?.city].filter(Boolean).join(", ");
  if (addr) { doc.text(addr, 48, y); y += 14; }
  if (ten?.gst_number) { doc.text(`GST: ${ten.gst_number}`, 48, y); y += 14; }
  y += 8; doc.setDrawColor(230).line(48, y, 547, y); y += 20;

  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(12).text(`Invoice #${order.order_number}`, 48, y);
  const tableTag = order.table_label ? `Table ${order.table_label}` : order.table_number ? `Table ${order.table_number}` : null;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
  const subLine = [format(new Date(order.created_at), "PPpp"), tableTag].filter(Boolean).join("  \u00b7  ");
  doc.text(subLine, 48, y + 14);
  doc.setTextColor(0).text(`${order.customer_name ?? ""} \u00b7 ${order.customer_phone ?? ""}`, 547, y, { align: "right" });
  const paid = order.payment_status === "paid";
  doc.setFontSize(9).setTextColor(paid ? 22 : 150, paid ? 101 : 100, 52)
    .text(String(order.payment_status ?? "").toUpperCase(), 547, y + 14, { align: "right" });
  y += 40;

  // Delivery address is part of the record of what was bought, so it belongs
  // on the invoice rather than only on the screen.
  if (order.order_type === "home_delivery" && order.delivery_address) {
    doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(10).text("Delivered to", 48, y); y += 14;
    doc.setFont("helvetica", "normal").setTextColor(120);
    const lines = doc.splitTextToSize(
      [order.delivery_address, order.delivery_landmark ? `Near ${order.delivery_landmark}` : null, order.delivery_pincode]
        .filter(Boolean).join(", "),
      400,
    );
    doc.text(lines, 48, y); y += lines.length * 12 + 12;
  }

  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(10);
  doc.text("Item", 48, y); doc.text("Qty", 340, y, { align: "right" }); doc.text("Price", 430, y, { align: "right" }); doc.text("Amount", 547, y, { align: "right" });
  y += 6; doc.setDrawColor(230).line(48, y, 547, y); y += 14;
  doc.setFont("helvetica", "normal");

  invoiceLines.forEach(i => {
    // Start a new page before the rows run off the bottom — a long order
    // otherwise writes its last items into the footer margin, or off-page.
    if (y > 720) { doc.addPage(); y = 64; }
    doc.text(String(i.name).slice(0, 50), 48, y);
    doc.text(String(i.quantity), 340, y, { align: "right" });
    doc.text(rs(Number(i.price)), 430, y, { align: "right" });
    doc.text(rs(Number(i.price) * i.quantity), 547, y, { align: "right" });
    y += 16;
  });

  if (y > 660) { doc.addPage(); y = 64; }
  y += 8; doc.setDrawColor(230).line(340, y, 547, y); y += 16;
  doc.text("Subtotal", 430, y, { align: "right" }); doc.text(rs(order.subtotal), 547, y, { align: "right" }); y += 14;
  doc.text("Tax", 430, y, { align: "right" }); doc.text(rs(order.tax), 547, y, { align: "right" }); y += 14;
  if (Number(order.delivery_fee) > 0) {
    doc.text("Delivery", 430, y, { align: "right" }); doc.text(rs(order.delivery_fee), 547, y, { align: "right" }); y += 14;
  }
  y += 2;
  doc.setFont("helvetica", "bold").text("Total", 430, y, { align: "right" }); doc.text(rs(order.total), 547, y, { align: "right" });
  y += 40; doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(120).text("Thank you for dining with us.", 48, y);
  y += 20; doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(160).text("Powered by PlateOS", 48, y);

  doc.save(`Invoice-${order.order_number}.pdf`);
}