import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Download, Plus } from "lucide-react";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/status")({ component: StatusPage });

function StatusPage() {
  const phone = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("phone");
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (!phone) return;
    const load = async () => {
      const { data } = await supabase.from("orders").select("*").eq("customer_phone", phone).order("created_at", { ascending: false }).limit(15);
      setOrders(data || []);
    };
    load();
    const ch = supabase.channel("status-" + phone).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [phone]);

  async function openOrder(o: any) {
    setSelected(o);
    const [{ data: oi }, { data: ten }] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", o.id),
      supabase.from("tenants").select("id,name,address,city,gst_number,slogan").eq("id", o.tenant_id).maybeSingle(),
    ]);
    setItems(oi || []); setTenant(ten);
  }

  function downloadInvoice() {
    if (!selected) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 48;
    doc.setFont("helvetica", "bold").setFontSize(18).text(tenant?.name || "Invoice", 48, y); y += 18;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
    if (tenant?.slogan) { doc.text(tenant.slogan, 48, y); y += 14; }
    const addr = [tenant?.address, tenant?.city].filter(Boolean).join(", ");
    if (addr) { doc.text(addr, 48, y); y += 14; }
    if (tenant?.gst_number) { doc.text(`GST: ${tenant.gst_number}`, 48, y); y += 14; }
    y += 8; doc.setDrawColor(230).line(48, y, 547, y); y += 20;
    doc.setTextColor(0).setFont("helvetica","bold").setFontSize(12).text(`Invoice #${selected.order_number}`, 48, y);
    doc.setFont("helvetica","normal").setFontSize(10).setTextColor(120).text(format(new Date(selected.created_at), "PPpp"), 48, y + 14);
    doc.setTextColor(0).text(`${selected.customer_name} \u00b7 ${selected.customer_phone}`, 547, y, { align: "right" });
    doc.setFontSize(9).setTextColor(selected.payment_status === "paid" ? 22 : 150, selected.payment_status === "paid" ? 101 : 100, 52).text(selected.payment_status.toUpperCase(), 547, y + 14, { align: "right" });
    y += 40;
    doc.setTextColor(0).setFont("helvetica","bold").setFontSize(10);
    doc.text("Item", 48, y); doc.text("Qty", 340, y, { align: "right" }); doc.text("Price", 430, y, { align: "right" }); doc.text("Amount", 547, y, { align: "right" });
    y += 6; doc.setDrawColor(230).line(48, y, 547, y); y += 14;
    doc.setFont("helvetica","normal");
    items.forEach(i => {
      doc.text(String(i.name).slice(0, 50), 48, y);
      doc.text(String(i.quantity), 340, y, { align: "right" });
      doc.text(money(Number(i.price)), 430, y, { align: "right" });
      doc.text(money(Number(i.price) * i.quantity), 547, y, { align: "right" });
      y += 16;
    });
    y += 8; doc.setDrawColor(230).line(340, y, 547, y); y += 16;
    doc.text("Subtotal", 430, y, { align: "right" }); doc.text(money(Number(selected.subtotal)), 547, y, { align: "right" }); y += 14;
    doc.text("Tax", 430, y, { align: "right" }); doc.text(money(Number(selected.tax)), 547, y, { align: "right" }); y += 16;
    doc.setFont("helvetica","bold").text("Total", 430, y, { align: "right" }); doc.text(money(Number(selected.total)), 547, y, { align: "right" });
    y += 40; doc.setFont("helvetica","italic").setFontSize(10).setTextColor(120).text("Thank you for dining with us.", 48, y);
    doc.save(`Invoice-${selected.order_number}.pdf`);
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
        <Card key={o.id} className="p-4 cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => openOrder(o)}>
          <div className="flex justify-between items-start">
            <div>
              <div className="font-medium">Order #{o.order_number}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(o.created_at), "PPp")}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs px-2 py-0.5 rounded bg-accent capitalize">{o.status}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.payment_status}</span>
            </div>
          </div>
          <div className="mt-2 font-medium">{money(Number(o.total))}</div>
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
                <Button onClick={downloadInvoice}><Download className="h-4 w-4 mr-2"/>Download invoice</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
