import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

export type QrPdfItem = { label: string; url: string; seats?: number | null; caption?: string };

// QR as a PNG data URL, rendered off-screen (no dependence on what's on the page).
async function qrPng(url: string): Promise<string> {
  const svg = renderToStaticMarkup(<QRCodeSVG value={url} size={600} level="M" includeMargin />);
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("QR render failed"));
      img.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 600, 600);
    ctx.drawImage(img, 0, 0, 600, 600);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * One A4 PDF with a printable card per QR (2 x 3 per page):
 * "Scan to view menu & order", the QR, and the table label.
 */
export async function downloadQrPdf(items: QrPdfItem[], filename: string, heading?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cols = 2, rows = 3, pageW = 210, pageH = 297, margin = 10;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2) / rows;
  const qrSize = 70;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const slot = i % (cols * rows);
    if (i > 0 && slot === 0) doc.addPage();
    const x = margin + (slot % cols) * cellW;
    const y = margin + Math.floor(slot / cols) * cellH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(heading ?? "Scan to view menu & order", x + cellW / 2, y + 6, { align: "center" });
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(it.label, x + cellW / 2, y + 15, { align: "center" });
    doc.addImage(await qrPng(it.url), "PNG", x + (cellW - qrSize) / 2, y + 19, qrSize, qrSize);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const sub = it.caption ?? (it.seats ? `${it.seats} seats` : "");
    if (sub) doc.text(sub, x + cellW / 2, y + 19 + qrSize + 7, { align: "center" });
  }
  doc.save(filename);
}
