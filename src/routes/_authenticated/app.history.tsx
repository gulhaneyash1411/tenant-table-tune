import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { History, Download, Search, Loader2, Bike, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/history")({ component: OrderHistory });

const TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  home_delivery: "Home Delivery",
};
const TYPE_FILTERS = ["all", "dine_in", "takeaway", "home_delivery"] as const;
const typeLabel = (t?: string) => TYPE_LABELS[t ?? ""] ?? (t?.replace("_", " ") ?? "—");

const PAGE_SIZE = 10;

function OrderHistory() {
  const [from, setFrom] = useState<string>(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load() {
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    const { data } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
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
    return rows.filter(o => {
      if (type !== "all" && o.order_type !== type) return false;
      if (!s) return true;
      return (
        o.order_number?.toString().includes(s) ||
        (o.customer_name || "").toLowerCase().includes(s) ||
        (o.customer_phone || "").includes(s) ||
        (o.delivery_address || "").toLowerCase().includes(s) ||
        (o.delivery_pincode || "").includes(s)
      );
    });
  }, [rows, q, type]);

  // Any change to the result set sends the reader back to the first page,
  // otherwise a narrower filter can leave them stranded on an empty page.
  useEffect(() => { setPage(1); }, [from, to, q, type]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart]
  );

  // Totals now include the delivery charge, so the headline figure is split:
  // what was collected overall, and how much of it was the delivery fee rather
  // than food. Without the split, delivery inflates revenue silently.
  // These stay on the full filtered set, not the current page.
  const paid = filtered.filter(o => o.payment_status === "paid");
  const totalRevenue = paid.reduce((a, b) => a + Number(b.total || 0), 0);
  const deliveryCollected = paid.reduce((a, b) => a + Number(b.delivery_fee || 0), 0);
  const deliveryCount = filtered.filter(o => o.order_type === "home_delivery").length;

  function exportCsv() {
    const header = [
      "Order #", "Date", "Customer", "Phone", "Type", "Address", "Landmark", "Pincode",
      "Status", "Payment", "Subtotal", "Tax", "Delivery", "Total",
    ];
    const csv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    filtered.forEach(o => {
      lines.push([
        o.order_number,
        format(new Date(o.created_at), "yyyy-MM-dd HH:mm"),
        csv(o.customer_name),
        o.customer_phone || "",
        typeLabel(o.order_type),
        csv(o.delivery_address),
        csv(o.delivery_landmark),
        o.delivery_pincode || "",
        o.status,
        o.payment_status,
        o.subtotal,
        o.tax,
        o.delivery_fee || 0,
        o.total,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${from}-to-${to}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
          <h1 className="text-xl sm:text-2xl font-semibold">Order history</h1>
        </div>
        {/* Dates share the row width on phones; the CSV button shrinks to its
            icon rather than pushing the inputs out of the viewport. */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="flex-1 min-w-0 sm:flex-none sm:w-auto"
          />
          <span className="text-muted-foreground text-sm shrink-0">to</span>
          <Input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="flex-1 min-w-0 sm:flex-none sm:w-auto"
          />
          <Button variant="outline" onClick={exportCsv} className="shrink-0" aria-label="Download CSV">
            <Download className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Total orders</div>
          <div className="text-xl sm:text-2xl font-semibold">{filtered.length}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Paid revenue</div>
          <div className="text-xl sm:text-2xl font-semibold break-all">{money(totalRevenue)}</div>
          {deliveryCollected > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              incl. {money(deliveryCollected)} delivery
            </div>
          )}
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Unpaid</div>
          <div className="text-xl sm:text-2xl font-semibold">
            {filtered.filter(o => o.payment_status !== "paid").length}
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Bike className="h-3 w-3 shrink-0" />Home delivery
          </div>
          <div className="text-xl sm:text-2xl font-semibold">{deliveryCount}</div>
        </Card>
      </div>

      <Card className="p-3 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search #, customer, phone, address"
            className="pl-9"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map(t => (
            <Button
              key={t}
              size="sm"
              variant={type === t ? "default" : "outline"}
              onClick={() => setType(t)}
              className="flex-1 min-w-[calc(50%-0.25rem)] sm:flex-none sm:min-w-0"
            >
              {t === "all" ? "All types" : TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Date, type and status drop out below md and reappear inside the
                customer cell, so a phone shows four columns rather than a
                sideways scroll through seven. */}
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 sm:p-3">#</th>
                <th className="p-3 hidden md:table-cell">Date</th>
                <th className="p-2 sm:p-3">Customer</th>
                <th className="p-3 hidden md:table-cell">Type</th>
                <th className="p-3 hidden lg:table-cell">Status</th>
                <th className="p-2 sm:p-3">Payment</th>
                <th className="p-2 sm:p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(o => (
                <tr
                  key={o.id}
                  className="border-t cursor-pointer hover:bg-accent/40"
                  onClick={() => setSelected(o)}
                >
                  <td className="p-2 sm:p-3 font-medium align-top">#{o.order_number}</td>
                  <td className="p-3 whitespace-nowrap hidden md:table-cell align-top">
                    {format(new Date(o.created_at), "PP p")}
                  </td>
                  <td className="p-2 sm:p-3 align-top">
                    <div className="break-words">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                    {o.order_type === "home_delivery" && o.delivery_address && (
                      <div className="text-xs text-muted-foreground truncate max-w-[160px] sm:max-w-[220px]">
                        {o.delivery_address}
                      </div>
                    )}
                    <div className="md:hidden mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(o.created_at), "dd MMM, p")}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                          o.order_type === "home_delivery"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {typeLabel(o.order_type)}
                      </span>
                      <span className="text-[10px] capitalize text-muted-foreground lg:hidden">
                        {o.status}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell align-top">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${
                        o.order_type === "home_delivery"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {typeLabel(o.order_type)}
                    </span>
                  </td>
                  <td className="p-3 capitalize hidden lg:table-cell align-top">{o.status}</td>
                  <td className="p-2 sm:p-3 align-top">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${
                        o.payment_status === "paid"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {o.payment_status}
                    </span>
                  </td>
                  <td className="p-2 sm:p-3 text-right font-medium whitespace-nowrap align-top">
                    {money(Number(o.total || 0))}
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />Loading orders…
                    </span>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No orders match this range and filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t p-3">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base sm:text-lg">Order #{selected?.order_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              {/* Stacked on phones; the middle dots only make sense once the
                  three fields sit on one line. */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                <span>{format(new Date(selected.created_at), "PPpp")}</span>
                <span className="hidden sm:inline">·</span>
                <span>{selected.customer_name}</span>
                <span className="hidden sm:inline">·</span>
                <span>{selected.customer_phone}</span>
              </div>

              <span
                className={`inline-block text-[10px] px-2 py-0.5 rounded ${
                  selected.order_type === "home_delivery"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {typeLabel(selected.order_type)}
              </span>

              {selected.order_type === "home_delivery" && selected.delivery_address && (
                <div className="text-sm border rounded p-2 bg-muted/30 break-words">
                  <div className="font-medium">Deliver to</div>
                  <div>{selected.delivery_address}</div>
                  {selected.delivery_landmark && (
                    <div className="text-muted-foreground">Near {selected.delivery_landmark}</div>
                  )}
                  <div className="text-muted-foreground">{selected.delivery_pincode}</div>
                </div>
              )}

              <div className="border rounded divide-y">
                {(items[selected.id] || []).map(i => (
                  <div key={i.id} className="p-2 flex justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{i.quantity}× {i.name}</span>
                    <span className="whitespace-nowrap">{money(Number(i.price) * i.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{money(Number(selected.subtotal))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span><span>{money(Number(selected.tax))}</span>
                </div>
                {Number(selected.delivery_fee) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery</span><span>{money(Number(selected.delivery_fee))}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total</span><span>{money(Number(selected.total))}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}