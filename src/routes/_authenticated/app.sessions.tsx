import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Timer, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchCurrentOutlet } from "@/lib/outlet-context";

export const Route = createFileRoute("/_authenticated/app/sessions")({ component: SessionHistory });

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  expired: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};
const statusBadge = (s?: string | null) => STATUS_BADGE[s ?? ""] ?? "bg-muted text-muted-foreground";

const REASON_LABELS: Record<string, string> = {
  bill_paid: "Bill paid",
  expired: "120-min expiry",
};
const reasonLabel = (r?: string | null) => REASON_LABELS[r ?? ""] ?? "—";

const localDate = (d: Date) => format(d, "yyyy-MM-dd");

const PAGE_SIZE = 15;

function SessionHistory() {
  const [tenant, setTenant] = useState<any>(null);
  const [from, setFrom] = useState<string>(localDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState<string>(localDate(new Date()));
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const t = await fetchCurrentOutlet(u.user!.id);
      setTenant(t);
    })();
  }, []);

  async function load() {
    if (!tenant?.id) return;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);

    const { data } = await (supabase as any)
      .from("ordering_sessions")
      .select("*")
      .eq("tenant_id", tenant.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });
    setRows(data || []);

    const names: Record<string, string> = {};
    const { data: tbls } = await supabase
      .from("restaurant_tables")
      .select("id,label")
      .eq("tenant_id", tenant.id);
    for (const t of (tbls ?? []) as any[]) {
      if (t.id && t.label) names[t.id] = String(t.label);
    }
    setTableNames(names);

    // Fetch orders linked to these sessions
    const sessionIds = (data || []).map((s: any) => s.id);
    if (sessionIds.length) {
      const { data: ords } = await (supabase as any)
        .from("orders")
        .select("id,order_number,status,payment_status,total,created_at,session_id,customer_name,customer_phone")
        .in("session_id", sessionIds);
      const bySession: Record<string, any[]> = {};
      for (const o of (ords ?? []) as any[]) {
        (bySession[o.session_id] ||= []).push(o);
      }
      setOrders(bySession);
    } else {
      setOrders({});
    }
    setLoading(false);
  }

  useEffect(() => { setLoading(true); load(); }, [from, to, tenant?.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!s) return true;
      const tableName = (tableNames[r.table_id] || "").toLowerCase();
      return tableName.includes(s) || r.id?.toLowerCase().includes(s);
    });
  }, [rows, q, statusFilter, tableNames]);

  useEffect(() => { setPage(1); }, [from, to, q, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(() => filtered.slice(pageStart, pageStart + PAGE_SIZE), [filtered, pageStart]);

  const activeCount = rows.filter((r: any) => r.status === "active").length;
  const closedCount = rows.filter((r: any) => r.status === "closed").length;
  const expiredCount = rows.filter((r: any) => r.status === "expired").length;

  const tableName = (id: string) => tableNames[id] || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
          <h1 className="text-lg font-semibold">Table Sessions</h1>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" className="flex-1 min-w-0 lg:w-40 lg:flex-none" />
          <span className="text-muted-foreground text-sm shrink-0">to</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" className="flex-1 min-w-0 lg:w-40 lg:flex-none" />
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Active</div>
          <div className="text-xl sm:text-2xl font-semibold">{activeCount}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Closed (paid)</div>
          <div className="text-xl sm:text-2xl font-semibold">{closedCount}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">Expired</div>
          <div className="text-xl sm:text-2xl font-semibold">{expiredCount}</div>
        </Card>
      </div>

      <Card className="p-3 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by table name" className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "closed", "expired"] as const).map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}
              className="flex-1 min-w-[calc(50%-0.25rem)] sm:flex-none sm:min-w-0">
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading sessions…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">No sessions match this range and filter</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y lg:hidden">
              {paged.map((s: any) => {
                const sessionOrders = orders[s.id] || [];
                return (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className="w-full text-left p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{tableName(s.table_id)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${statusBadge(s.status)}`}>{s.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Started {format(new Date(s.created_at), "dd MMM, p")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.closed_at ? `Ended ${format(new Date(s.closed_at), "dd MMM, p")}` : "—"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Reason: {reasonLabel(s.closure_reason)}</span>
                      <span className="text-[10px] text-muted-foreground">· {sessionOrders.length} order{sessionOrders.length !== 1 ? "s" : ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-3">Table</th>
                    <th className="p-3">Started</th>
                    <th className="p-3">Ended</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s: any) => {
                    const sessionOrders = orders[s.id] || [];
                    const startTime = new Date(s.created_at).getTime();
                    const endTime = s.closed_at ? new Date(s.closed_at).getTime() : Date.now();
                    const durationMin = Math.round((endTime - startTime) / 60000);
                    return (
                      <tr key={s.id} className="border-t cursor-pointer hover:bg-accent/40" onClick={() => setSelected(s)}>
                        <td className="p-3 font-medium">{tableName(s.table_id)}</td>
                        <td className="p-3 whitespace-nowrap">{format(new Date(s.created_at), "dd MMM, p")}</td>
                        <td className="p-3 whitespace-nowrap">{s.closed_at ? format(new Date(s.closed_at), "dd MMM, p") : "—"}</td>
                        <td className="p-3 whitespace-nowrap">{durationMin} min</td>
                        <td className="p-3">{reasonLabel(s.closure_reason)}</td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${statusBadge(s.status)}`}>{s.status}</span>
                        </td>
                        <td className="p-3 text-right">{sessionOrders.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t p-3">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-1">
              <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />Previous
              </Button>
              <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next<ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Session detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base sm:text-lg">
              Session — {selected ? tableName(selected.table_id) : ""}
            </DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const sessionOrders = orders[selected.id] || [];
            const startTime = new Date(selected.created_at).getTime();
            const endTime = selected.closed_at ? new Date(selected.closed_at).getTime() : Date.now();
            const durationMin = Math.round((endTime - startTime) / 60000);
            const totalBilled = sessionOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded capitalize mt-0.5 ${statusBadge(selected.status)}`}>{selected.status}</span>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Closure reason</div>
                    <div className="font-medium mt-0.5">{reasonLabel(selected.closure_reason)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Started</div>
                    <div className="font-medium mt-0.5">{format(new Date(selected.created_at), "dd MMM yyyy, p")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ended</div>
                    <div className="font-medium mt-0.5">{selected.closed_at ? format(new Date(selected.closed_at), "dd MMM yyyy, p") : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="font-medium mt-0.5">{durationMin} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expires at</div>
                    <div className="font-medium mt-0.5">{format(new Date(selected.expires_at), "dd MMM yyyy, p")}</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Orders in this session ({sessionOrders.length})</div>
                  {sessionOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders were placed in this session.</p>
                  ) : (
                    <div className="border rounded divide-y">
                      {sessionOrders.map((o: any) => (
                        <div key={o.id} className="p-2 flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium">#{o.order_number}</div>
                            <div className="text-xs text-muted-foreground">{o.customer_name} · {format(new Date(o.created_at), "p")}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium">{money(Number(o.total || 0))}</div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                              {o.payment_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sessionOrders.length > 0 && (
                    <div className="flex justify-between items-center mt-2 text-sm font-semibold">
                      <span>Total billed</span>
                      <span>{money(totalBilled)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
