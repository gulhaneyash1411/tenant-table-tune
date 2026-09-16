import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { format, subDays } from "date-fns";
import { Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/customers")({ component: Customers });

const PAGE_SIZE = 10;

function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [visitFilter, setVisitFilter] = useState("all"); // all | new | returning
  const [period, setPeriod] = useState("all");           // all | 7 | 30 | 90

  const [selected, setSelected] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch current page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("customers")
        .select("*", { count: "exact" })
        .order("last_visit", { ascending: false, nullsFirst: false });

      if (debounced) {
        const s = debounced.replace(/[,()%]/g, ""); // keep the .or() filter valid
        if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
      }
      if (visitFilter === "new") q = q.eq("visits", 1);
      if (visitFilter === "returning") q = q.gt("visits", 1);
      if (period !== "all") q = q.gte("last_visit", subDays(new Date(), Number(period)).toISOString());

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (cancelled) return;
      if (error) console.error(error);
      setRows(data || []);
      setTotal(count || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, debounced, visitFilter, period]);

  async function open(c: any) {
    setSelected(c);
    setOrders([]);
    setOrdersLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_phone", c.phone)
      .order("created_at", { ascending: false });
    setOrders(data || []);
    setOrdersLoading(false);
  }

  function resetFilters() {
    setSearch("");
    setDebounced("");
    setVisitFilter("all");
    setPeriod("all");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const hasFilters = !!search || visitFilter !== "all" || period !== "all";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Customers</h1>

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
          <TableBody className={loading ? "opacity-60" : ""}>
            {rows.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.visits}</TableCell>
                <TableCell>{money(Number(c.total_spend))}</TableCell>
                <TableCell>{c.last_visit ? format(new Date(c.last_visit), "PP") : "—"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => open(c)}>Orders</Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
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
            <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <OrderHistoryDialog
        customer={selected}
        orders={orders}
        loading={ordersLoading}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function OrderHistoryDialog({
  customer,
  orders,
  loading,
  onClose,
}: {
  customer: any | null;
  orders: any[];
  loading: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(null);
  }, [customer?.id]);

  async function toggle(o: any) {
    if (expanded === o.id) return setExpanded(null);
    setExpanded(o.id);
    if (items[o.id]) return;
    setLoadingId(o.id);
    const { data, error } = await supabase.from("order_items").select("*").eq("order_id", o.id);
    if (error) console.error(error);
    setItems(prev => ({ ...prev, [o.id]: data || [] }));
    setLoadingId(null);
  }

  const lifetime = orders.reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <Dialog open={!!customer} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer?.name} — Order history</DialogTitle>
          {customer && (
            <p className="text-sm text-muted-foreground">
              {customer.phone} · {orders.length} orders · {money(lifetime)} total
            </p>
          )}
        </DialogHeader>

        <div className="divide-y max-h-[60vh] overflow-y-auto">
          {loading && <div className="py-6 text-center text-muted-foreground text-sm">Loading orders…</div>}

          {!loading && orders.map(o => {
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
                      <Row label="Total" value={money(Number(o.total))} bold />
                      {o.payment_method && <Row label="Payment" value={o.payment_method} />}
                      {o.notes && <Row label="Notes" value={o.notes} />}
                    </dl>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && orders.length === 0 && (
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
      <dd className="text-right">{value}</dd>
    </div>
  );
}