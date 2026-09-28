import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { mergeOrderItems } from "@/lib/order-items";
import { format } from "date-fns";
import { History, Download, Search, Loader2, Bike, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/history")({ component: OrderHistory });

const TYPE_FILTERS = ["all", "dine_in", "takeaway", "home_delivery"] as const;

// ---- Order type / status tags ---------------------------------------------
// Kept in step with the same block on the Customers screen: if a label or a
// colour changes here, change it there too.

const TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  home_delivery: "Home Delivery",
};
const typeLabel = (t?: string | null) =>
  TYPE_LABELS[t ?? ""] ?? (t ? t.replace(/_/g, " ") : "—");

// Tailwind's own palette at 15% rather than the app's semantic tokens: the set
// needed here is wider than the four the theme defines (primary/success/
// warning/muted), and a /15 background reads correctly on both surfaces — the
// text darkens in light mode and lightens in dark.
const TYPE_BADGE: Record<string, string> = {
  dine_in: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  takeaway: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  home_delivery: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};
const typeBadge = (t?: string | null) => TYPE_BADGE[t ?? ""] ?? "bg-muted text-muted-foreground";

// Lifecycle status. Both the older and the newer name for the same step map to
// one colour; anything unknown falls back to neutral rather than unstyled.
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  placed: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  accepted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  preparing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ready: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  served: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  out_for_delivery: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};
const statusBadge = (s?: string | null) => STATUS_BADGE[s ?? ""] ?? "bg-muted text-muted-foreground";
const statusLabel = (s?: string | null) => (s ? s.replace(/_/g, " ") : "—");

// ---------------------------------------------------------------------------
// Working out which table an order was served at
//
// This deployment stores only orders.table_id — a FK into `restaurant_tables`
// — so the number has to be looked up rather than read off the order. The two
// other shapes this schema has used (a literal column, an embedded join row)
// are still handled, so the page keeps working either way.
//
// Mirrors the same block on the Customers screen; change one, change both.
// ---------------------------------------------------------------------------

/** Only scalars — a joined object would otherwise stringify to "[object Object]". */
const scalar = (v: any) =>
  typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

/** The column holding a table's display number differs by deployment too. */
const TABLE_LABEL_KEYS = [
  "table_number",
  "table_no",
  "number",
  "no",
  "label",
  "name",
  "title",
  "code",
];
const labelFromTableRow = (row: any): string => {
  for (const k of TABLE_LABEL_KEYS) {
    const v = scalar(row?.[k]);
    if (v && v.toLowerCase() !== "null") return v;
  }
  return "";
};

/** The id an order points at, whichever way round the FK was named. */
const tableIdOf = (o: any): string =>
  scalar(o?.table_id) || scalar(o?.tableId) || scalar(o?.restaurant_table_id) || scalar(o?.table?.id);

type TableNames = Record<string, string>;

const tableNo = (o: any, names: TableNames = {}): string | null => {
  // A literal on the order itself
  let s =
    scalar(o?.table_number) || scalar(o?.table_no) || scalar(o?.table) || scalar(o?.table_name);

  // An embedded row from a join
  if (!s && o?.table && typeof o.table === "object") s = labelFromTableRow(o.table);

  // The FK, resolved through the restaurant_tables read
  if (!s) {
    const id = tableIdOf(o);
    if (id && names[id]) s = names[id];
  }

  return s && s.toLowerCase() !== "null" ? s : null;
};

/** "Table 4" for a dine-in order that has one, null otherwise. */
const tableTag = (o: any, names: TableNames = {}): string | null => {
  if (o?.order_type !== "dine_in") return null;
  const t = tableNo(o, names);
  if (!t) return null;
  return /^\d+$/.test(t) ? `Table ${t}` : t;
};

// payment_status enum: unpaid | paid | refunded. Refunded is neither money owed
// (amber) nor money taken (green), so it gets a neutral badge — same palette as
// the live orders board.
const PAYMENT_BADGE: Record<string, string> = {
  unpaid: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  refunded: "bg-muted text-muted-foreground",
};
const paymentBadge = (s?: string) => PAYMENT_BADGE[s ?? ""] ?? "bg-muted text-muted-foreground";

// Local calendar date. toISOString() would give the UTC day, which in IST names
// yesterday until 05:30 — and since the range below is built in local time,
// orders placed after midnight would fall outside it and simply not appear.
const localDate = (d: Date) => format(d, "yyyy-MM-dd");

const PAGE_SIZE = 10;

function OrderHistory() {
  const [from, setFrom] = useState<string>(localDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState<string>(localDate(new Date()));
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [tableNames, setTableNames] = useState<TableNames>({});
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load() {
    // Half-open [start, midnight after `to`): an inclusive 23:59:59 end drops
    // anything in the final second of the last day.
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });
    setRows(data || []);

    // Table numbers. Read whole rather than joined onto orders: a mis-named
    // join drops every order, whereas a failed read here costs only the table
    // label. A restaurant has tens of tables, so it is one small read, and the
    // date range doesn't change which tables exist.
    //
    // Named literally rather than through a variable: the client is typed from
    // the generated schema, so the relation has to be a known key at compile
    // time. Rows are widened to any because the label column is probed (see
    // labelFromTableRow) instead of being assumed.
    const names: TableNames = {};
    const { data: tbls, error: tblErr } = await supabase.from("restaurant_tables").select("*");
    if (tblErr) {
      console.warn("Order history: restaurant_tables could not be read:", tblErr.message);
    } else {
      for (const t of (tbls ?? []) as any[]) {
        const id = scalar(t?.id);
        const label = labelFromTableRow(t);
        if (id && label) names[id] = label;
      }
    }
    setTableNames(names);

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
    // "4", "t4" and "table 4" all mean the same table. Kept separate from `s`
    // and only used when it is non-empty, or a bare "t" would match every row
    // whose table is blank.
    const sTable = s.replace(/^t(?:able)?\s*/, "");
    return rows.filter(o => {
      if (type !== "all" && o.order_type !== type) return false;
      if (!s) return true;
      const tn = (tableNo(o, tableNames) || "").toLowerCase();
      return (
        o.order_number?.toString().includes(s) ||
        (o.customer_name || "").toLowerCase().includes(s) ||
        (o.customer_phone || "").includes(s) ||
        (!!sTable && !!tn && tn.includes(sTable)) ||
        (o.delivery_address || "").toLowerCase().includes(s) ||
        (o.delivery_pincode || "").includes(s)
      );
    });
  }, [rows, q, type, tableNames]);

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

  // The dish ordered in two rounds is two order_items rows; the receipt shows
  // one line per dish with the quantities summed, so the line amount is the
  // unit price times the merged quantity. Only the order being viewed is
  // merged — the rest of the map is untouched, and so are the raw rows behind
  // the CSV export.
  const selectedItems = useMemo(
    () => (selected ? mergeOrderItems(items[selected.id] || []) : []),
    [selected, items]
  );

  // Totals now include the delivery charge, so the headline figure is split:
  // what was collected overall, and how much of it was the delivery fee rather
  // than food. Without the split, delivery inflates revenue silently.
  // These stay on the full filtered set, not the current page.
  const paid = filtered.filter(o => o.payment_status === "paid");
  const totalRevenue = paid.reduce((a, b) => a + Number(b.total || 0), 0);
  const deliveryCollected = paid.reduce((a, b) => a + Number(b.delivery_fee || 0), 0);
  const deliveryCount = filtered.filter(o => o.order_type === "home_delivery").length;
  // Counted positively: "not paid" would sweep refunded orders in with the
  // ones still owing money, which they are not.
  const unpaidCount = filtered.filter(o => o.payment_status === "unpaid").length;
  const refundedCount = filtered.filter(o => o.payment_status === "refunded").length;

  function exportCsv() {
    const header = [
      "Order #", "Date", "Customer", "Phone", "Type", "Table", "Address", "Landmark", "Pincode",
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
        // Table is meaningful for dine-in only, so it stays blank elsewhere
        // rather than repeating whatever the row happens to carry. The bare
        // number goes out, not "Table 4" — a spreadsheet wants to sort it.
        o.order_type === "dine_in" ? (tableNo(o, tableNames) ?? "") : "",
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
          <div className="text-xl sm:text-2xl font-semibold">{unpaidCount}</div>
          {refundedCount > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {refundedCount} refunded
            </div>
          )}
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
            placeholder="Search #, customer, phone, table, address"
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
                sideways scroll through seven. The table number rides with the
                type badge in both layouts — it is only meaningful next to
                "Dine-in", and a column of its own would be empty for two
                thirds of the rows. */}
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
              {paged.map(o => {
                const table = tableTag(o, tableNames);
                return (
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
                          className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${typeBadge(o.order_type)}`}
                        >
                          {typeLabel(o.order_type)}
                        </span>
                        {table && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {table}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded capitalize whitespace-nowrap lg:hidden ${statusBadge(o.status)}`}
                        >
                          {statusLabel(o.status)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell align-top">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${typeBadge(o.order_type)}`}
                      >
                        {typeLabel(o.order_type)}
                      </span>
                      {/* Dine-in only, and only when a table was recorded. */}
                      {table && (
                        <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          {table}
                        </div>
                      )}
                    </td>
                    <td className="p-3 hidden lg:table-cell align-top">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded capitalize whitespace-nowrap ${statusBadge(o.status)}`}
                      >
                        {statusLabel(o.status)}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 align-top">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${paymentBadge(o.payment_status)}`}
                      >
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 text-right font-medium whitespace-nowrap align-top">
                      {money(Number(o.total || 0))}
                    </td>
                  </tr>
                );
              })}
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

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded ${typeBadge(selected.order_type)}`}
                >
                  {typeLabel(selected.order_type)}
                </span>
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded capitalize ${statusBadge(selected.status)}`}
                >
                  {statusLabel(selected.status)}
                </span>
                {tableTag(selected, tableNames) && (
                  <span className="text-xs font-medium">{tableTag(selected, tableNames)}</span>
                )}
              </div>

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
                {selectedItems.map(i => (
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