import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { mergeOrderItems } from "@/lib/order-items";
import { discountLabel, readOrderBill } from "@/lib/billing";
import { format, subDays } from "date-fns";
import { Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/customers")({ component: Customers });

const PAGE_SIZE = 10;

// PostgREST caps a single response at 1000 rows by default, so orders are read
// in pages rather than in one select — otherwise the list silently truncates at
// a thousand orders and older customers start disappearing.
const FETCH_CHUNK = 1000;

// ---- Order type / status tags ---------------------------------------------
// Kept in step with the same block on the Order history screen: if a label or
// a colour changes here, change it there too.

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
// Three shapes have turned up across deployments of this schema, so all three
// are handled rather than one being assumed:
//
//   1. a literal on the order      — table_number / table_no / table / table_name
//   2. an embedded object          — table: { table_number: 4 }  (a PostgREST join)
//   3. a foreign key               — table_id → tables.id
//
// (3) is the one that left the Status column bare: the order carries only a
// UUID, so the number has to come from the `tables` table, which is read once
// in load() and passed down as a lookup.
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
  // (1) a literal on the order itself
  let s =
    scalar(o?.table_number) || scalar(o?.table_no) || scalar(o?.table) || scalar(o?.table_name);

  // (2) an embedded row from a join
  if (!s && o?.table && typeof o.table === "object") s = labelFromTableRow(o.table);

  // (3) the FK, resolved through the tables read
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

// ---------------------------------------------------------------------------
// Why this page reads orders and not just the `customers` table
//
// `customers` is a cache, and only the public QR/takeaway/delivery checkout
// path writes to it. An order created at the counter through New order inserts
// into `orders` and stops there, so that guest never turned up on this screen.
// Orders are the actual record of who came in, so the list is built from them
// and the `customers` row is merged in afterwards for the fields an order
// doesn't carry (a corrected name).
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
  visits: number;
  total_spend: number;
  last_visit: string | null;
  // How they last ate with us: the order type of their most recent real visit,
  // plus the table if that visit was dine-in. This is what the Status column
  // shows, in place of the email address that used to sit there.
  last_type: string | null;
  last_table: string | null;
  orders: any[];
};

function Customers() {
  const [orders, setOrders] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [tableNames, setTableNames] = useState<TableNames>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [visitFilter, setVisitFilter] = useState("all"); // all | new | returning
  const [typeFilter, setTypeFilter] = useState("all");   // all | dine_in | takeaway | home_delivery
  const [period, setPeriod] = useState("all");           // all | 7 | 30 | 90
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const { tenant } = useTenantContext();

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setError(null);

    const rows: any[] = [];
    for (let from = 0; ; from += FETCH_CHUNK) {
      // select("*") rather than a column list: the optional invoice columns
      // (discount, payment_method, notes) aren't on every deployment of this
      // schema, and naming one that isn't there fails the whole read — which
      // is how "column orders.discount does not exist" emptied this page. The
      // renderers below already treat those fields as optional, and the table
      // column is read the same defensive way (see tableNo above).
      const { data, error: ordErr } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", tenant.id)
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

    // Table numbers. orders.table_id is a FK into `restaurant_tables` (confirmed
    // against information_schema — plain `tables` does not exist here, which is
    // what left this column blank). Read whole rather than joined onto orders:
    // a mis-named join drops every order, whereas a failed read here costs only
    // the table label. A restaurant has tens of tables, so it is one small read.
    //
    // Named literally rather than through a variable: the client is typed from
    // the generated schema, so the relation has to be a known key at compile
    // time. Rows are widened to any because the label column is probed (see
    // labelFromTableRow) instead of being assumed.
    const names: TableNames = {};
    const { data: tbls, error: tblErr } = await supabase.from("restaurant_tables").select("*").eq("tenant_id", tenant.id);
    if (tblErr) {
      console.warn("Customers: restaurant_tables could not be read:", tblErr.message);
    } else {
      for (const t of (tbls ?? []) as any[]) {
        const id = scalar(t?.id);
        const label = labelFromTableRow(t);
        if (id && label) names[id] = label;
      }
    }
    setTableNames(names);

    // If dine-in orders exist but not one of them resolves to a table, the
    // shape assumed above is wrong — say so with the keys actually present,
    // rather than quietly rendering a blank column.
    const dineIn = rows.filter(o => o?.order_type === "dine_in");
    if (dineIn.length && !dineIn.some(o => tableNo(o, names))) {
      console.warn(
        "Customers: no table could be resolved for any dine-in order. Keys on a sample order:",
        Object.keys(dineIn[0] ?? {}),
      );
    }

    // Optional enrichment: a name corrected in the guest's profile beats
    // whatever was typed on the last ticket. If the table is missing or RLS
    // blocks it, the page still works from orders alone.
    const { data: cust, error: custErr } = await supabase.from("customers").select("*").eq("tenant_id", tenant.id);
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
  }, [tenant]);

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
      const pk = phoneKey(o.customer_phone);
      const nameFallback = (o.customer_name || "").trim().toLowerCase();
      const key = pk || (nameFallback ? `name:${nameFallback}` : "");
      if (!key) continue;

      let rec = byPhone.get(key);
      if (!rec) {
        rec = {
          key,
          name: o.customer_name || "Walk-in",
          phone: o.customer_phone,
          visits: 0,
          total_spend: 0,
          last_visit: null,
          last_type: null,
          last_table: null,
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
        // The status shown is the one from the visit that set last_visit, so
        // the two columns always describe the same order.
        if (!rec.last_visit || o.created_at > rec.last_visit) {
          rec.last_visit = o.created_at;
          rec.last_type = o.order_type ?? null;
          rec.last_table = tableTag(o, tableNames);
        }
      }
    }

    // A profile with no orders yet still belongs on the list.
    for (const [key, c] of Object.entries(profiles)) {
      const rec = byPhone.get(key);
      if (rec) {
        rec.id = c.id;
        if (c.name) rec.name = c.name;
      } else {
        byPhone.set(key, {
          key,
          id: c.id,
          name: c.name || "—",
          phone: c.phone,
          visits: Number(c.visits || 0),
          total_spend: Number(c.total_spend || 0),
          last_visit: c.last_visit ?? null,
          last_type: null,
          last_table: null,
          orders: [],
        });
      }
    }

    return [...byPhone.values()].sort((a, b) =>
      (b.last_visit ?? "").localeCompare(a.last_visit ?? ""),
    );
  }, [orders, profiles, tableNames]);

  const filtered = useMemo(() => {
    const s = debounced.toLowerCase();
    const sDigits = s.replace(/\D/g, "");
    const cutoff = period === "all" ? null : subDays(new Date(), Number(period)).toISOString();

    return customers.filter(c => {
      if (visitFilter === "new" && c.visits !== 1) return false;
      if (visitFilter === "returning" && c.visits <= 1) return false;
      if (typeFilter !== "all" && c.last_type !== typeFilter) return false;
      if (cutoff && (!c.last_visit || c.last_visit < cutoff)) return false;
      if (!s) return true;
      return (
        (c.name ?? "").toLowerCase().includes(s) ||
        (sDigits ? c.key.includes(sDigits) : false) ||
        (c.last_table ?? "").toLowerCase().includes(s)
      );
    });
  }, [customers, debounced, visitFilter, typeFilter, period]);

  // Any change to the result set sends the reader back to page one, otherwise a
  // narrower filter can strand them on an empty page.
  useEffect(() => { setPage(1); }, [debounced, visitFilter, typeFilter, period]);

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
  const hasFilters = !!search || visitFilter !== "all" || typeFilter !== "all" || period !== "all";

  function resetFilters() {
    setSearch("");
    setDebounced("");
    setVisitFilter("all");
    setTypeFilter("all");
    setPeriod("all");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
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
            placeholder="Search name, phone or table"
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
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="dine_in">Dine-in</SelectItem>
            <SelectItem value="takeaway">Takeaway</SelectItem>
            <SelectItem value="home_delivery">Home Delivery</SelectItem>
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
              <TableHead>Status</TableHead>
              <TableHead>Table</TableHead>
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
                <TableCell>{c.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {c.last_type ? (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${typeBadge(c.last_type)}`}
                    >
                      {typeLabel(c.last_type)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {/* Its own column now rather than a tag tucked beside the type
                    badge — a dine-in guest with no table recorded reads as a
                    dash here instead of as an absence you have to notice. */}
                <TableCell className="whitespace-nowrap">
                  {c.last_table ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
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
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading customers…
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!loading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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

      <OrderHistoryDialog
        customer={selected}
        tableNames={tableNames}
        onClose={() => setSelected(null)}
      />
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
  tableNames,
  onClose,
}: {
  customer: CustomerRow | null;
  tableNames: TableNames;
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
    // Stored as read; the merge for display happens at render (see below), so
    // the rows here still match what is in the database.
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
            // One row per dish with the quantities summed: the same dish added
            // in two rounds is two order_items rows, which would otherwise
            // appear as two identical lines. Qty and Amount both follow the
            // merged quantity, and rows only merge at the same unit price, so
            // the amounts still add up to the subtotal.
            const lines = items[o.id] ? mergeOrderItems(items[o.id]) : undefined;
            const table = tableTag(o, tableNames);
            const bill = readOrderBill(o);
            return (
              <div key={o.id}>
                <button
                  type="button"
                  onClick={() => toggle(o)}
                  aria-expanded={isOpen}
                  aria-controls={`order-${o.id}`}
                  className="w-full py-3 px-2 flex items-center justify-between gap-2 text-sm text-left rounded hover:bg-muted/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                    #{o.order_number} · {format(new Date(o.created_at), "PPp")}
                    <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${typeBadge(o.order_type)}`}>
                      {typeLabel(o.order_type)}
                    </span>
                    {table && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{table}</span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-xs capitalize whitespace-nowrap ${statusBadge(o.status)}`}>
                      {statusLabel(o.status)}
                    </span>
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
                      {table && <Row label="Table" value={table} />}
                      {o.subtotal != null && <Row label="Subtotal" value={money(Number(o.subtotal))} />}
                      {bill.discountAmount > 0 ? (
                        <>
                          <Row label={discountLabel(bill, money)} value={`− ${money(bill.discountAmount)}`} />
                          <Row label="After discount" value={money(bill.subtotalAfterDiscount)} />
                        </>
                      ) : Number(o.discount) > 0 && <Row label="Discount" value={`− ${money(Number(o.discount))}`} />}
                      {o.tax != null && <Row label="Tax" value={money(Number(o.tax))} />}
                      {bill.serviceCharge > 0 && <Row label="Service charges" value={`+ ${money(bill.serviceCharge)}`} />}
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