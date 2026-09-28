import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { format, subDays } from "date-fns";
import { Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/customers")({ component: Customers });

const PAGE_SIZE = 10;

// PostgREST caps a single response at 1000 rows by default, so orders are read
// in pages rather than in one select — otherwise the list silently truncates at
// a thousand orders and older customers start disappearing.
const FETCH_CHUNK = 1000;

// ---------------------------------------------------------------------------
// Why this page reads orders and not just the `customers` table
//
// `customers` is a cache, and only the public QR/takeaway/delivery checkout
// path writes to it. An order created at the counter through New order inserts
// into `orders` and stops there, so that guest never turned up on this screen.
// Orders are the actual record of who came in, so the list is built from them
// and the `customers` row is merged in afterwards for the fields an order
// doesn't carry (email, a corrected name).
//
// If you later add a database trigger that keeps `customers` in sync, this page
// keeps working unchanged — the merge below just stops having anything to fix.
// ---------------------------------------------------------------------------

/** Digits only, last 10 — "+91 98765 43210" and "9876543210" are one guest. */
const phoneKey = (v: any) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** A cancelled order is neither a visit nor money taken. */
const isRealVisit = (o: any) => o.status !== "cancelled";

type CustomerRow = {
  key: string;
  id?: string;
  name: string;
  phone: string;
  email: string | null;
  visits: number;
  total_spend: number;
  last_visit: string | null;
  orders: any[];
};

function Customers() {
  const [orders, setOrders] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [visitFilter, setVisitFilter] = useState("all"); // all | new | returning
  const [period, setPeriod] = useState("all");           // all | 7 | 30 | 90
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<CustomerRow | null>(null);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);

    const rows: any[] = [];
    for (let from = 0; ; from += FETCH_CHUNK) {
      // select("*") rather than a column list: the optional invoice columns
      // (discount, payment_method, notes) aren't on every deployment of this
      // schema, and naming one that isn't there fails the whole read — which
      // is how "column orders.discount does not exist" emptied this page. The
      // renderers below already treat those fields as optional.
      const { data, error: ordErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + FETCH_CHUNK - 1);

      if (ordErr) {
        // Said out loud rather than swallowed: an empty list caused by a failed
        // read looks exactly like an empty list caused by having no customers.
        console.error("Customers: orders could not be read:", ordErr.code, ordErr.message);
        setError(ordErr.message);
        break;
      }
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < FETCH_CHUNK) break;
    }
    setOrders(rows);

    // Optional enrichment. If the table is missing or RLS blocks it, the page
    // still works — it just loses email addresses.
    const { data: cust, error: custErr } = await supabase.from("customers").select("*");
    if (custErr) {
      console.warn("Customers: profile table unavailable:", custErr.message);
      setProfiles({});
      return;
    }
    const map: Record<string, any> = {};
    for (const c of cust ?? []) {
      const k = phoneKey(c.phone);
      if (k) map[k] = c;
    }
    setProfiles(map);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // A new order is a new (or returning) customer, so the list follows the
  // orders table live. Debounced: a busy service fires several events a minute
  // and each reload re-reads the whole history.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const queue = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(), 1500);
    };
    const ch = supabase
      .channel("customers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, queue)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // ---- Build the customer list from orders --------------------------------
  const customers = useMemo<CustomerRow[]>(() => {
    const byPhone = new Map<string, CustomerRow>();

    for (const o of orders) {
      const key = phoneKey(o.customer_phone);
      // A walk-in with no number can't be told apart from the next one, so it
      // isn't turned into a customer — it stays in Order history only.
      if (!key) continue;

      let rec = byPhone.get(key);
      if (!rec) {
        rec = {
          key,
          name: o.customer_name || "Walk-in",
          phone: o.customer_phone,
          email: null,
          visits: 0,
          total_spend: 0,
          last_visit: null,
          orders: [],
        };
        byPhone.set(key, rec);
      }
      // `orders` arrives newest first, so each customer's list is already in
      // the order the dialog wants to show it.
      rec.orders.push(o);

      if (isRealVisit(o)) {
        rec.visits += 1;
        rec.total_spend += Number(o.total || 0);
        if (!rec.last_visit || o.created_at > rec.last_visit) rec.last_visit = o.created_at;
      }
    }

    // Merge the stored profile: a name or email captured there beats whatever
    // was typed on the last ticket, and a profile with no orders yet still
    // belongs on the list.
    for (const [key, c] of Object.entries(profiles)) {
      const rec = byPhone.get(key);
      if (rec) {
        rec.id = c.id;
        if (c.name) rec.name = c.name;
        rec.email = c.email ?? null;
      } else {
        byPhone.set(key, {
          key,
          id: c.id,
          name: c.name || "—",
          phone: c.phone,
          email: c.email ?? null,
          visits: Number(c.visits || 0),
          total_spend: Number(c.total_spend || 0),
          last_visit: c.last_visit ?? null,
          orders: [],
        });
      }
    }

    return [...byPhone.values()].sort((a, b) =>
      (b.last_visit ?? "").localeCompare(a.last_visit ?? ""),
    );
  }, [orders, profiles]);

  const filtered = useMemo(() => {
    const s = debounced.toLowerCase();
    const sDigits = s.replace(/\D/g, "");
    const cutoff = period === "all" ? null : subDays(new Date(), Number(period)).toISOString();

    return customers.filter(c => {
      if (visitFilter === "new" && c.visits !== 1) return false;
      if (visitFilter === "returning" && c.visits <= 1) return false;
      if (cutoff && (!c.last_visit || c.last_visit < cutoff)) return false;
      if (!s) return true;
      return (
        (c.name ?? "").toLowerCase().includes(s) ||
        (sDigits ? c.key.includes(sDigits) : false) ||
        (c.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [customers, debounced, visitFilter, period]);

  // Any change to the result set sends the reader back to page one, otherwise a
  // narrower filter can strand them on an empty page.
  useEffect(() => { setPage(1); }, [debounced, visitFilter, period]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart],
  );

  const start = total === 0 ? 0 : pageStart + 1;
  const end = Math.min(pageStart + PAGE_SIZE, total);
  const hasFilters = !!search || visitFilter !== "all" || period !== "all";

  function resetFilters() {
    setSearch("");
    setDebounced("");
    setVisitFilter("all");
    setPeriod("all");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Customers could not be loaded: {error}
        </div>
      )}

      {/* Search & filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search name, phone or email"
            aria-label="Search customers"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={visitFilter} onValueChange={v => { setVisitFilter(v); setPage(1); }}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by visits"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="new">New (1 visit)</SelectItem>
            <SelectItem value="returning">Returning</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={v => { setPeriod(v); setPage(1); }}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by last visit"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && <Button variant="ghost" onClick={resetFilters}>Reset</Button>}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>Total spend</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={refreshing ? "opacity-60" : ""}>
            {paged.map(c => (
              <TableRow key={c.key}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.visits}</TableCell>
                <TableCell>{money(Number(c.total_spend))}</TableCell>
                <TableCell>{c.last_visit ? format(new Date(c.last_visit), "PP") : "—"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>Orders</Button>
                </TableCell>
              </TableRow>
            ))}

            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading customers…
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!loading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {hasFilters ? "No customers match your filters." : "No customers yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground" aria-live="polite">
            Showing {start}–{end} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <OrderHistoryDialog customer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order history for one customer
//
// The orders are already in memory from the list above, so this no longer
// re-queries them — only the line items, and only for the row being opened.
// ---------------------------------------------------------------------------

function OrderHistoryDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => { setExpanded(null); }, [customer?.key]);

  const orders = customer?.orders ?? [];

  async function toggle(o: any) {
    if (expanded === o.id) return setExpanded(null);
    setExpanded(o.id);
    if (items[o.id]) return;
    setLoadingId(o.id);
    const { data, error } = await supabase.from("order_items").select("*").eq("order_id", o.id);
    if (error) console.error("Order items could not be read:", error.message);
    setItems(prev => ({ ...prev, [o.id]: data || [] }));
    setLoadingId(null);
  }

  // Cancelled orders are listed but don't count towards the lifetime figure —
  // the same rule the visits and spend columns use.
  const lifetime = orders.reduce(
    (s, o) => (isRealVisit(o) ? s + Number(o.total || 0) : s),
    0,
  );

  return (
    <Dialog open={!!customer} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer?.name} — Order history</DialogTitle>
          {customer && (
            <p className="text-sm text-muted-foreground">
              {customer.phone} · {orders.length} {orders.length === 1 ? "order" : "orders"} ·{" "}
              {money(lifetime)} total
            </p>
          )}
        </DialogHeader>

        <div className="divide-y max-h-[60vh] overflow-y-auto">
          {orders.map(o => {
            const isOpen = expanded === o.id;
            const lines = items[o.id];
            return (
              <div key={o.id}>
                <button
                  type="button"
                  onClick={() => toggle(o)}
                  aria-expanded={isOpen}
                  aria-controls={`order-${o.id}`}
                  className="w-full py-3 px-2 flex items-center justify-between gap-2 text-sm text-left rounded hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                    #{o.order_number} · {format(new Date(o.created_at), "PPp")}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{o.status}</span>
                  </span>
                  <span className="font-medium">{money(Number(o.total))}</span>
                </button>

                {isOpen && (
                  <div id={`order-${o.id}`} className="px-8 pb-4 text-sm space-y-3">
                    {loadingId === o.id ? (
                      <p className="text-muted-foreground">Loading items…</p>
                    ) : lines && lines.length > 0 ? (
                      <table className="w-full">
                        <thead className="text-muted-foreground text-xs">
                          <tr>
                            <th className="text-left font-normal py-1">Item</th>
                            <th className="text-right font-normal">Qty</th>
                            <th className="text-right font-normal">Price</th>
                            <th className="text-right font-normal">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(i => (
                            <tr key={i.id}>
                              <td className="py-1">{i.name}</td>
                              <td className="text-right">{i.quantity}</td>
                              <td className="text-right">{money(Number(i.price))}</td>
                              <td className="text-right">{money(Number(i.price) * Number(i.quantity))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-muted-foreground">No items recorded.</p>
                    )}

                    <dl className="border-t pt-2 space-y-1">
                      {o.subtotal != null && <Row label="Subtotal" value={money(Number(o.subtotal))} />}
                      {Number(o.discount) > 0 && <Row label="Discount" value={`− ${money(Number(o.discount))}`} />}
                      {o.tax != null && <Row label="Tax" value={money(Number(o.tax))} />}
                      {Number(o.delivery_fee) > 0 && <Row label="Delivery" value={money(Number(o.delivery_fee))} />}
                      <Row label="Total" value={money(Number(o.total))} bold />
                      {o.payment_status && <Row label="Payment status" value={o.payment_status} />}
                      {o.payment_method && <Row label="Payment" value={o.payment_method} />}
                      {o.notes && <Row label="Notes" value={o.notes} />}
                    </dl>
                  </div>
                )}
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="py-6 text-center text-muted-foreground text-sm">No orders</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right capitalize">{value}</dd>
    </div>
  );
}