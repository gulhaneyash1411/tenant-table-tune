import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getOrdersByPhone, getOrderDetail } from "@/lib/public-orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
const rs = (n: number) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
import { format } from "date-fns";
import { Download, Loader2, Plus, Receipt, ChefHat, BellRing, CheckCircle2, XCircle, AlertCircle, Bike } from "lucide-react";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/status")({ component: StatusPage });

/**
 * The four stages a customer actually cares about, in order. Everything the
 * kitchen reports is mapped onto one of these — the raw status string is a
 * back-of-house vocabulary ("confirmed", "in_progress") that means nothing to
 * someone waiting at a table.
 */
const STAGES = ["placed", "preparing", "ready", "served"] as const;
type Stage = typeof STAGES[number];

const STAGE_OF: Record<string, Stage> = {
  new: "placed", pending: "placed", placed: "placed",
  confirmed: "preparing", accepted: "preparing", preparing: "preparing", in_progress: "preparing", cooking: "preparing",
  ready: "ready", prepared: "ready",
  served: "served", completed: "served", delivered: "served", done: "served",
};

const STAGE_COPY: Record<Stage, { label: string; Icon: typeof Receipt }> = {
  placed: { label: "Order received", Icon: Receipt },
  preparing: { label: "Preparing your food", Icon: ChefHat },
  ready: { label: "Ready to serve", Icon: BellRing },
  served: { label: "Served — enjoy your meal", Icon: CheckCircle2 },
};

// A delivery order's last two stages mean something different to the guest:
// nothing is "served" to them, it leaves the kitchen and arrives at a door.
const DELIVERY_STAGE_COPY: Partial<Record<Stage, { label: string; Icon: typeof Receipt }>> = {
  ready: { label: "Out for delivery", Icon: Bike },
  served: { label: "Delivered — enjoy your meal", Icon: CheckCircle2 },
};

function stageCopy(stage: Stage, orderType?: string) {
  if (orderType === "home_delivery" && DELIVERY_STAGE_COPY[stage]) return DELIVERY_STAGE_COPY[stage]!;
  return STAGE_COPY[stage];
}

const CANCELLED = new Set(["cancelled", "canceled", "rejected", "refunded"]);

const TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  home_delivery: "Home delivery",
};

/**
 * Four-segment bar plus a plain-language line. The list refreshes on every
 * realtime order event (and on a 5s poll as a fallback), so a kitchen status
 * change shows up here as the bar filling one more segment.
 */
function OrderProgress({ status, orderType }: { status: string; orderType?: string }) {
  const key = String(status || "").toLowerCase().trim();

  if (CANCELLED.has(key)) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">Order cancelled</span>
      </div>
    );
  }

  // An unrecognised status is shown verbatim rather than guessed at — a wrong
  // stage is worse than no stage when someone is waiting on their food. If you
  // see this line in the app, add that status string to STAGE_OF above.
  const stage = STAGE_OF[key];
  if (!stage) {
    return <div className="mt-3 text-sm text-muted-foreground capitalize">{key.replace(/_/g, " ") || "Status unavailable"}</div>;
  }

  const reached = STAGES.indexOf(stage);
  const { label, Icon } = stageCopy(stage, orderType);

  return (
    <div className="mt-3">
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STAGES.length}
        aria-valuenow={reached + 1}
        aria-valuetext={label}
      >
        {STAGES.map((s, idx) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${idx <= reached ? "bg-primary" : "bg-muted-foreground/20"}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-sm font-medium text-primary">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/**
 * Loads a remote logo into a data URL so jsPDF can embed it. Fetches the
 * bytes directly (instead of drawing a cross-origin <img> onto a canvas) so
 * a storage host that omits permissive CORS headers can't taint the canvas
 * and silently drop the logo; this also normalises any source format
 * (PNG/JPEG/WEBP) to PNG, which is what jsPDF is told to expect below.
 */
async function loadLogo(url?: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL("image/png"), w: bitmap.width, h: bitmap.height };
  } catch {
    return null;
  }
}

function StatusPage() {
  const phone = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("phone");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const cancelledRef = useRef(false);

  // Single refresh used by the first load, the poll and the realtime handler,
  // so all three paths behave identically.
  const refresh = useCallback(async (isFirst: boolean) => {
    if (!phone) return;
    try {
      const list = await getOrdersByPhone({ data: { phone } });
      if (cancelledRef.current) return;
      setOrders(list || []);
      setRefreshError(false);
    } catch (err) {
      // Previously swallowed. A silently failing refresh looks exactly like
      // "nothing has changed", which is what makes a stale status so hard to
      // diagnose — so it's logged and surfaced in the UI instead.
      console.error("[status] refresh failed", err);
      if (!cancelledRef.current) setRefreshError(true);
    } finally {
      if (!cancelledRef.current && isFirst) setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    cancelledRef.current = false;
    refresh(true);

    // Poll is the fallback path. Realtime below is what makes a kitchen status
    // change appear immediately; if realtime isn't enabled on the orders table
    // in Supabase, this still catches it within 5s.
    const timer = setInterval(() => refresh(false), 5000);

    // Filtering by customer_phone keeps this client from waking on every
    // order in the restaurant. If your column differs, change the filter.
    const channel = supabase
      .channel(`orders-status-${phone}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `customer_phone=eq.${phone}` },
        () => refresh(false),
      )
      .subscribe();

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [phone, refresh]);

  // Keep the open dialog in step with the refreshed list, otherwise the sheet
  // holds the snapshot from the moment it was opened and shows a stale stage
  // while the card behind it has already advanced.
  useEffect(() => {
    if (!selected) return;
    const fresh = orders.find((o: any) => o.id === selected.id);
    if (fresh && fresh.status !== selected.status) setSelected(fresh);
  }, [orders, selected]);

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

    // Delivery address is part of the record of what was bought, so it belongs
    // on the invoice rather than only on the screen.
    if (order.order_type === "home_delivery" && order.delivery_address) {
      doc.setTextColor(0).setFont("helvetica","bold").setFontSize(10).text("Delivered to", 48, y); y += 14;
      doc.setFont("helvetica","normal").setTextColor(120);
      const lines = doc.splitTextToSize(
        [order.delivery_address, order.delivery_landmark ? `Near ${order.delivery_landmark}` : null, order.delivery_pincode]
          .filter(Boolean).join(", "),
        400,
      );
      doc.text(lines, 48, y); y += lines.length * 12 + 12;
    }

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
    doc.text("Tax", 430, y, { align: "right" }); doc.text(rs(order.tax), 547, y, { align: "right" }); y += 14;
    if (Number(order.delivery_fee) > 0) {
      doc.text("Delivery", 430, y, { align: "right" }); doc.text(rs(order.delivery_fee), 547, y, { align: "right" }); y += 14;
    }
    y += 2;
    doc.setFont("helvetica","bold").text("Total", 430, y, { align: "right" }); doc.text(rs(order.total), 547, y, { align: "right" });
    y += 40; doc.setFont("helvetica","italic").setFontSize(10).setTextColor(120).text("Thank you for dining with us.", 48, y);
    y += 20; doc.setFont("helvetica","normal").setFontSize(8).setTextColor(160).text("Powered by PlateOS", 48, y);
    doc.save(`Invoice-${order.order_number}.pdf`);
  }

  function keepOrdering() {
    if (!selected) return;
    if (selected.order_type === "home_delivery") window.location.href = `/delivery/${selected.tenant_id}`;
    else if (selected.order_type === "takeaway") window.location.href = `/takeaway/${selected.tenant_id}`;
    else if (selected.table_id) window.location.href = `/t/${selected.table_id}`;
    else window.location.href = `/takeaway/${selected.tenant_id}`;
  }

  return (
    // Same frame as the menu and order-status screens: plain page behind a
    // phone-width tinted column, so the gutters on a desktop viewport match
    // and this doesn't read as a different app.
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg min-h-screen bg-slate-100 p-4 pb-16 space-y-4 shadow-xl shadow-black/5">
        <h1 className="text-2xl font-bold tracking-tight px-1 pt-2">Your orders</h1>

        {refreshError && (
          <div className="flex items-center gap-2 rounded-2xl bg-warning/15 text-warning px-4 py-3 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Can't reach the kitchen right now — this status may be out of date.
          </div>
        )}

        {orders.map(o => (
          <Card key={o.id} className="p-4 rounded-3xl border-0 bg-background shadow-md shadow-black/5">
            {/* The whole header block is one button so the card is reachable
                by keyboard; the Invoice button sits outside it, since nesting
                a button inside a button is invalid markup. */}
            <button
              onClick={() => openOrder(o)}
              className="w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-bold">Order #{o.order_number}</span>
                <span className="text-lg font-bold tabular-nums">{money(Number(o.total))}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(o.created_at), "PPp")}
                {o.order_type && <> · {TYPE_LABELS[o.order_type] ?? o.order_type}</>}
              </div>
              <OrderProgress status={o.status} orderType={o.order_type} />
            </button>

            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.payment_status}</span>
              <Button size="sm" variant="outline" className="rounded-full h-9 px-4 border-2 font-semibold" onClick={() => downloadInvoice(o)}>
                <Download className="h-3.5 w-3.5 mr-1.5"/>Invoice
              </Button>
            </div>
          </Card>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Loading your orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-10">No recent orders.</div>
        ) : null}

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          {/* Corner radius matched to the cart and item sheets on the menu. */}
          <DialogContent className="max-w-md rounded-[32px]">
            <DialogHeader><DialogTitle>Order #{selected?.order_number}</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-3">
                <OrderProgress status={selected.status} orderType={selected.order_type} />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{format(new Date(selected.created_at), "PPpp")}</span>
                  <span className={`px-2.5 py-1 rounded-full font-medium ${selected.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{selected.payment_status}</span>
                </div>

                {selected.order_type === "home_delivery" && selected.delivery_address && (
                  <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Bike className="h-3.5 w-3.5" />Delivering to
                    </div>
                    <div className="mt-1">{selected.delivery_address}</div>
                    {selected.delivery_landmark && <div className="text-muted-foreground">Near {selected.delivery_landmark}</div>}
                    <div className="text-muted-foreground">{selected.delivery_pincode}</div>
                  </div>
                )}

                <div className="divide-y rounded-2xl bg-muted/40">
                  {items.map(i => (
                    <div key={i.id} className="p-3 flex justify-between text-sm">
                      <span>{i.quantity}× {i.name}</span>
                      <span>{money(Number(i.price) * i.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(Number(selected.subtotal))}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(Number(selected.tax))}</span></div>
                  {Number(selected.delivery_fee) > 0 && (
                    <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>{money(Number(selected.delivery_fee))}</span></div>
                  )}
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{money(Number(selected.total))}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button variant="outline" className="h-12 rounded-full font-semibold border-2" onClick={keepOrdering}><Plus className="h-4 w-4 mr-2"/>Keep ordering</Button>
                  <Button className="h-12 rounded-full font-semibold shadow-lg shadow-primary/25" onClick={() => downloadInvoice()}><Download className="h-4 w-4 mr-2"/>Download invoice</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}