import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Download } from "lucide-react";

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
      supabase.from("tenants").select("name,address,city,gst_number,slogan").eq("id", o.tenant_id).maybeSingle(),
    ]);
    setItems(oi || []); setTenant(ten);
  }

  function downloadInvoice() {
    if (!selected) return;
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const rows = items.map(i => `<tr><td>${i.name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${money(Number(i.price))}</td><td style="text-align:right">${money(Number(i.price) * i.quantity)}</td></tr>`).join("");
    win.document.write(`<html><head><title>Invoice #${selected.order_number}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #eee;font-size:14px}th{text-align:left;background:#f7f7f7}.tot{font-weight:600}.muted{color:#666;font-size:12px}.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;background:${selected.payment_status==='paid'?'#dcfce7':'#fef3c7'};color:${selected.payment_status==='paid'?'#166534':'#92400e'}}</style>
      </head><body>
      <h1>${tenant?.name || "Invoice"}</h1>
      <div class="muted">${tenant?.slogan || ""}</div>
      <div class="muted">${[tenant?.address, tenant?.city].filter(Boolean).join(", ")}</div>
      ${tenant?.gst_number ? `<div class="muted">GST: ${tenant.gst_number}</div>` : ""}
      <hr style="margin:16px 0"/>
      <div style="display:flex;justify-content:space-between">
        <div><b>Invoice #${selected.order_number}</b><br/><span class="muted">${format(new Date(selected.created_at),"PPpp")}</span></div>
        <div style="text-align:right"><span class="badge">${selected.payment_status.toUpperCase()}</span><br/><span class="muted">${selected.customer_name} · ${selected.customer_phone}</span></div>
      </div>
      <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <table style="margin-top:12px">
        <tr><td>Subtotal</td><td style="text-align:right">${money(Number(selected.subtotal))}</td></tr>
        <tr><td>Tax</td><td style="text-align:right">${money(Number(selected.tax))}</td></tr>
        <tr class="tot"><td>Total</td><td style="text-align:right">${money(Number(selected.total))}</td></tr>
      </table>
      <p class="muted" style="margin-top:24px">Thank you for dining with us.</p>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    win.document.close();
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
              <Button onClick={downloadInvoice} className="w-full"><Download className="h-4 w-4 mr-2"/>Download invoice</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
