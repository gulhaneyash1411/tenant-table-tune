  import { createFileRoute } from "@tanstack/react-router";
  import { useEffect, useMemo, useState } from "react";
  import { supabase } from "@/integrations/supabase/client";
  import { useTenantContext } from "@/hooks/use-session";
  import { Card } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { money } from "@/lib/format";
  import { format } from "date-fns";
  import { History, Download, Search, Loader2, Share2, MessageCircle, RotateCcw, Copy, Check } from "lucide-react";

  export const Route = createFileRoute("/_authenticated/app/history")({ component: OrderHistory });

  /** Country code prefixed to 10-digit local numbers for WhatsApp deep links. */
  const DEFAULT_COUNTRY_CODE = "91";
  /** Plain ASCII divider - no box-drawing characters, nothing that can mis-encode. */
  const RULE = "------------------------------";
  const PLATESOS_URL = "https://release-tenant-table-tune.ygulhane135.workers.dev/";

  function normalizePhone(raw?: string | null) {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
    if (digits.startsWith("0") && digits.length === 11) return DEFAULT_COUNTRY_CODE + digits.slice(1);
    return digits;
  }

  /** "22:00:00" -> "22:00"; leaves anything unexpected alone. */
  function shortTime(t?: string | null) {
    const s = (t || "").trim();
    return /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : "";
  }

  /** "Timings: 10:00 to 22:00", or whichever half is available. */
  function timingsLine(tenant: any) {
    const opens = shortTime(tenant?.opening_time);
    const closes = shortTime(tenant?.closing_time);
    if (opens && closes) return `Timings: ${opens} to ${closes}`;
    if (opens) return `Opens at ${opens}`;
    if (closes) return `Closes at ${closes}`;
    return "";
  }

  function addressLine(tenant: any) {
    const street = [tenant?.address, tenant?.city, tenant?.state].filter(Boolean).join(", ");
    return [street, tenant?.pincode].filter(Boolean).join(" ").trim();
  }

  /** Table label for dine-in; falls back to the order type for takeaway/delivery. */
  function tableLabel(order: any) {
    const t = order?.table_number ?? order?.table_name ?? order?.table_no ?? order?.table?.number;
    if (t !== undefined && t !== null && String(t).trim()) return String(t).trim();
    return String(order?.order_type || "").replace(/_/g, " ") || "-";
  }

  function titleCase(s?: string | null) {
    const v = String(s || "").replace(/_/g, " ").trim();
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : "";
  }

  /**
   * Builds the invoice message from the order and the tenant row saved on the
   * Settings page. Deliberately plain text: no emoji, no box-drawing rules, no
   * asterisk markers - only characters that survive every encoding path. Emphasis
   * comes from capitals and spacing. GST is split evenly into CGST/SGST, standard
   * for an intra-state bill.
   */
  function buildInvoiceText(order: any, lines: any[] = [], tenant?: any) {
    const businessName = (tenant?.name || "").trim() || "our restaurant";
    const address = addressLine(tenant);
    const timings = timingsLine(tenant);
    const firstName = String(order?.customer_name || "").trim().split(" ")[0];
    const tax = Number(order?.tax || 0);
    const half = tax / 2;

    const out: string[] = [];
    out.push(`Invoice from ${businessName}`);
    out.push(RULE);
    out.push("ORDER INVOICE");
    out.push(RULE);
    out.push(`Order ID: #${order.order_number}`);
    out.push(`Date: ${format(new Date(order.created_at), "PPp")}`);
    out.push(`Table: ${tableLabel(order)}`);

    if (firstName) {
      out.push("");
      out.push(`Hi ${firstName},`);
      out.push("Here is your bill.");
    }

    out.push("");
    out.push("ITEMS ORDERED");
    if (lines.length) {
      lines.forEach(i =>
        out.push(`${i.name} x ${i.quantity} - ${money(Number(i.price) * i.quantity)}`)
      );
    } else {
      out.push("(item details unavailable)");
    }

    out.push(RULE);
    out.push(`Subtotal: ${money(Number(order.subtotal || 0))}`);
    out.push(`CGST: ${money(half)}`);
    out.push(`SGST: ${money(half)}`);
    out.push(`Total Tax: ${money(tax)}`);
    out.push(`TOTAL: ${money(Number(order.total || 0))}`);
    out.push(RULE);
    out.push(`Payment: ${titleCase(order.payment_method) || "-"}`);
    out.push(`Payment Status: ${order.payment_status === "paid" ? "Paid" : "Pending"}`);

    out.push("");
    out.push("Thank you for dining with us!");
    out.push("");
    out.push("We hope to serve you again soon.");
    out.push("");
    out.push(businessName);
    if (address) out.push(address);
    if (timings) out.push(timings);
    if (tenant?.gst_number?.trim()) out.push(`GSTIN: ${tenant.gst_number.trim()}`);
    out.push("Invoice and tax details are provided as applicable.");

    out.push(RULE);
    out.push("Powered by PlatesOS");
    out.push("Your restaurant, online and thriving.");
    out.push(PLATESOS_URL);

    return out.join("\n");
  }

  function OrderHistory() {
    // The layout caches the tenant and Settings refreshes it on save, so an edited
    // name shows up here without a reload. Falls back to a direct read.
    const tenantCtx = useTenantContext() as any;
    const contextTenant = tenantCtx?.tenant ?? null;
    const [fetchedTenant, setFetchedTenant] = useState<any>(null);
    const tenant = contextTenant ?? fetchedTenant;

    const [from, setFrom] = useState<string>(new Date(Date.now()-6*86400000).toISOString().slice(0,10));
    const [to, setTo] = useState<string>(new Date().toISOString().slice(0,10));
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<any[]>([]);
    const [items, setItems] = useState<Record<string, any[]>>({});
    const [selected, setSelected] = useState<any>(null);
    const [sharing, setSharing] = useState<any>(null);
    const [message, setMessage] = useState("");
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (contextTenant) return;
      (async () => {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) return;
        const { data } = await supabase.from("tenants").select("*").eq("owner_id", u.user.id).maybeSingle();
        if (data) setFetchedTenant(data);
      })();
    }, [contextTenant]);

    async function load() {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59").toISOString();
      const { data } = await supabase.from("orders").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
      setRows(data || []);
      const ids = (data || []).map(o => o.id);
      if (ids.length) {
        const { data: oi } = await supabase.from("order_items").select("*").in("order_id", ids);
        const by: Record<string, any[]> = {};
        (oi || []).forEach(i => (by[i.order_id] ||= []).push(i));
        setItems(by);
      } else setItems({});
      setLoading(false);
    }
    useEffect(() => { setLoading(true); load(); }, [from, to]);

    const filtered = useMemo(() => {
      const s = q.trim().toLowerCase();
      if (!s) return rows;
      return rows.filter(o => o.order_number?.toString().includes(s) || (o.customer_name||"").toLowerCase().includes(s) || (o.customer_phone||"").includes(s));
    }, [rows, q]);

    const totalRevenue = filtered.filter(o=>o.payment_status==="paid").reduce((a,b)=>a+Number(b.total||0),0);

    function exportCsv() {
      const header = ["Order #","Date","Customer","Phone","Type","Status","Payment","Subtotal","Tax","Total"];
      const lines = [header.join(",")];
      filtered.forEach(o => {
        lines.push([o.order_number, format(new Date(o.created_at),"yyyy-MM-dd HH:mm"), `"${o.customer_name||""}"`, o.customer_phone||"", o.order_type, o.status, o.payment_status, o.subtotal, o.tax, o.total].join(","));
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `orders-${from}-to-${to}.csv`; a.click();
    }

    const shareLines = sharing ? (items[sharing.id] || []) : [];
    const sharePhone = sharing ? normalizePhone(sharing.customer_phone) : "";

    function openShare(order: any) {
      setMessage(buildInvoiceText(order, items[order.id] || [], tenant));
      setCopied(false);
      setSharing(order);
    }

    function resetMessage() {
      if (!sharing) return;
      setMessage(buildInvoiceText(sharing, shareLines, tenant));
    }

    /** Opens WhatsApp already addressed to the customer, with the edited message pre-filled. */
    function sendOnWhatsapp() {
      if (!sharing || !sharePhone || !message.trim()) return;
      window.open(
        `https://wa.me/${sharePhone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
      setSharing(null);
    }

    async function copyMessage() {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2"><History className="h-6 w-6"/><h1 className="text-2xl font-semibold">Order history</h1></div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-auto"/>
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-auto"/>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1"/>CSV</Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4"><div className="text-xs text-muted-foreground">Total orders</div><div className="text-2xl font-semibold">{filtered.length}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Paid revenue</div><div className="text-2xl font-semibold">{money(totalRevenue)}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Unpaid</div><div className="text-2xl font-semibold">{filtered.filter(o=>o.payment_status!=="paid").length}</div></Card>
        </div>
        <Card className="p-3"><div className="relative"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input placeholder="Search #, customer, phone" className="pl-9" value={q} onChange={e=>setQ(e.target.value)}/></div></Card>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr>
              <th className="p-3">#</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Invoice</th>
            </tr></thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-t cursor-pointer hover:bg-accent/40" onClick={()=>setSelected(o)}>
                  <td className="p-3 font-medium">#{o.order_number}</td>
                  <td className="p-3">{format(new Date(o.created_at),"PP p")}</td>
                  <td className="p-3">{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                  <td className="p-3 capitalize">{o.order_type?.replace("_"," ")}</td>
                  <td className="p-3 capitalize">{o.status}</td>
                  <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded ${o.payment_status==="paid"?"bg-success/15 text-success":"bg-warning/15 text-warning"}`}>{o.payment_status}</span></td>
                  <td className="p-3 text-right font-medium">{money(Number(o.total||0))}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!normalizePhone(o.customer_phone)}
                      title={normalizePhone(o.customer_phone) ? `Send invoice to ${o.customer_phone}` : "No phone number on this order"}
                      onClick={(e)=>{ e.stopPropagation(); openShare(o); }}
                    >
                      <Share2 className="h-4 w-4 mr-1"/>Share
                    </Button>
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/>Loading orders</span></td></tr>}
              {!loading && filtered.length===0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No orders in this range</td></tr>}
            </tbody>
          </table>
        </Card>

        <Dialog open={!!selected} onOpenChange={(o)=>!o && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Order #{selected?.order_number}</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {format(new Date(selected.created_at),"PPpp")} - {selected.customer_name} - {selected.customer_phone}
                </div>
                <div className="border rounded divide-y">
                  {(items[selected.id]||[]).map(i => (
                    <div key={i.id} className="p-2 flex justify-between text-sm">
                      <span>{i.quantity} x {i.name}</span>
                      <span>{money(Number(i.price)*i.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(Number(selected.subtotal))}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(Number(selected.tax))}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{money(Number(selected.total))}</span></div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" disabled={!normalizePhone(selected.customer_phone)} onClick={()=>openShare(selected)}>
                    <Share2 className="h-4 w-4 mr-1"/>Share invoice
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)}>
  <DialogContent className="w-[500px] h-[500px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
    <DialogHeader className="shrink-0 p-4 pb-2">
      <DialogTitle>Send invoice #{sharing?.order_number}</DialogTitle>
    </DialogHeader>

    {sharing && (
      <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 gap-3">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-sm text-muted-foreground truncate">
            To {sharing.customer_name || "customer"} (+{sharePhone})
          </span>
          <Button variant="ghost" size="sm" onClick={resetMessage} title="Restore the default message" className="shrink-0">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-1">
          <label
            htmlFor="invoice-message"
            className="text-xs text-muted-foreground shrink-0"
          >
            Message preview — editing is disabled.
          </label>

          <textarea
            id="invoice-message"
            value={message}
            readOnly
            className="flex-1 min-h-0 w-full resize-none overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm leading-relaxed cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="text-xs text-muted-foreground text-right shrink-0">
            {message.length} characters
          </div>
        </div>

        <Button className="w-full shrink-0" onClick={sendOnWhatsapp} disabled={!message.trim()}>
          <MessageCircle className="h-4 w-4 mr-1" />
          Send on WhatsApp
        </Button>

        <Button variant="ghost" size="sm" className="w-full shrink-0" onClick={copyMessage}>
          {copied ? (<><Check className="h-4 w-4 mr-1" />Copied</>) : (<><Copy className="h-4 w-4 mr-1" />Copy message</>)}
        </Button>
      </div>
    )}
  </DialogContent>
</Dialog>
      </div>
    );
  }