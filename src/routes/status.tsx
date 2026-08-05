import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getOrdersByPhone, getOrderDetail } from "@/lib/public-orders.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
const rs = (n: number) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
import { format } from "date-fns";
import { Download, Plus } from "lucide-react";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/status")({ component: StatusPage });

/** Loads a remote logo into a data URL so jsPDF can embed it. */
async function loadLogo(url?: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

function StatusPage() {
  const phone = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("phone");
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    const load = async () => {
      try {
        const list = await getOrdersByPhone({ data: { phone } });
        if (!cancelled) setOrders(list || []);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [phone]);

  async function openOrder(o: any) {
    setSelected(o);
    const detail = await getOrderDetail({ data: { order_id: o.id, phone: phone! } });
    setItems(detail.items || []); setTenant(detail.tenant);
  }

  async function downloadInvoice(orderArg?: any) {
    let order = orderArg || selected;
    let its = orderArg ? [] as any[] : items;
    let ten = tenant;
    if (!order) return;
    if (orderArg) {
      const detail = await getOrderDetail({ data: { order_id: order.id, phone: phone! } });
      its = detail.items || []; ten = detail.tenant;
    }
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 48;
    const logo = await loadLogo(ten?.logo_url);
    if (logo) {
      const size = 56;
      const h = Math.min(size, (logo.h / logo.w) * size);
      try { doc.addImage(logo.data, "PNG", 491, y - 22, size, h); } catch { /* ignore bad image */ }
    }
    doc.setFont("helvetica", "bold").setFontSize(18).text(ten?.name || "Invoice", 48, y); y += 18;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
    if (ten?.slogan) { doc.text(ten.slogan, 48, y); y += 14; }
    const addr = [ten?.address, ten?.city].filter(Boolean).join(", ");
    if (addr) { doc.text(addr, 48, y); y += 14; }
    if (ten?.gst_number) { doc.text(`GST: ${ten.gst_number}`, 48, y); y += 14; }
    y += 8; doc.setDrawColor(230).line(48, y, 547, y); y += 20;
    doc.setTextColor(0).setFont("helvetica","bold").setFontSize(12).text(`Invoice #${order.order_number}`, 48, y);
    doc.setFont("helvetica","normal").setFontSize(10).setTextColor(120).text(format(new Date(order.created_at), "PPpp"), 48, y + 14);
    doc.setTextColor(0).text(`${order.customer_name} \u00b7 ${order.customer_phone}`, 547, y, { align: "right" });
    doc.setFontSize(9).setTextColor(order.payment_status === "paid" ? 22 : 150, order.payment_status === "paid" ? 101 : 100, 52).text(order.payment_status.toUpperCase(), 547, y + 14, { align: "right" });
    y += 40;
    doc.setTextColor(0).setFont("helvetica","bold").setFontSize(10);
    doc.text("Item", 48, y); doc.text("Qty", 340, y, { align: "right" }); doc.text("Price", 430, y, { align: "right" }); doc.text("Amount", 547, y, { align: "right" });
    y += 6; doc.setDrawColor(230).line(48, y, 547, y); y += 14;
    doc.setFont("helvetica","normal");
    its.forEach(i => {
      doc.text(String(i.name).slice(0, 50), 48, y);
      doc.text(String(i.quantity), 340, y, { align: "right" });
      doc.text(rs(Number(i.price)), 430, y, { align: "right" });
      doc.text(rs(Number(i.price) * i.quantity), 547, y, { align: "right" });
      y += 16;
    });
    y += 8; doc.setDrawColor(230).line(340, y, 547, y); y += 16;
    doc.text("Subtotal", 430, y, { align: "right" }); doc.text(rs(order.subtotal), 547, y, { align: "right" }); y += 14;
    doc.text("Tax", 430, y, { align: "right" }); doc.text(rs(order.tax), 547, y, { align: "right" }); y += 16;
    doc.setFont("helvetica","bold").text("Total", 430, y, { align: "right" }); doc.text(rs(order.total), 547, y, { align: "right" });
    y += 40; doc.setFont("helvetica","italic").setFontSize(10).setTextColor(120).text("Thank you for dining with us.", 48, y);
    doc.save(`Invoice-${order.order_number}.pdf`);
  }

  function keepOrdering() {
    if (!selected) return;
    if (selected.order_type === "takeaway") window.location.href = `/takeaway/${selected.tenant_id}`;
    else if (selected.table_id) window.location.href = `/t/${selected.table_id}`;
    else window.location.href = `/takeaway/${selected.tenant_id}`;
  }

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      {orders.map(o => (
        <Card key={o.id} className="p-4 hover:bg-accent/40 transition-colors">
          <div className="flex justify-between items-start cursor-pointer" onClick={() => openOrder(o)}>
            <div>
              <div className="font-medium">Order #{o.order_number}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(o.created_at), "PPp")}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs px-2 py-0.5 rounded bg-accent capitalize">{o.status}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.payment_status}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="font-medium">{money(Number(o.total))}</div>
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); downloadInvoice(o); }}>
              <Download className="h-3 w-3 mr-1"/>Invoice
            </Button>
          </div>
        </Card>
      ))}
      {orders.length === 0 && <div className="text-muted-foreground text-sm">No recent orders.</div>}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Order #{selected?.order_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="capitalize">Status: <b>{selected.status}</b></span>
                <span className={`text-xs px-2 py-0.5 rounded ${selected.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{selected.payment_status}</span>
              </div>
              <div className="text-xs text-muted-foreground">{format(new Date(selected.created_at), "PPpp")}</div>
              <div className="divide-y border rounded">
                {items.map(i => (
                  <div key={i.id} className="p-2 flex justify-between text-sm">
                    <span>{i.quantity}× {i.name}</span>
                    <span>{money(Number(i.price) * i.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(Number(selected.subtotal))}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(Number(selected.tax))}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>{money(Number(selected.total))}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={keepOrdering}><Plus className="h-4 w-4 mr-2"/>Keep ordering</Button>
                <Button onClick={() => downloadInvoice()}><Download className="h-4 w-4 mr-2"/>Download invoice</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
