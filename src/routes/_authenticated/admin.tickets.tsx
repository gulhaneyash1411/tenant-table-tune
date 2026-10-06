import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, X, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tickets")({ component: Tickets });

type SortKey = "newest" | "oldest" | "priority";

const PAGE_SIZE = 10;
const STATUS_ORDER = ["open", "in_progress", "resolved"];
const PRIORITY_ORDER = ["urgent", "high", "medium", "normal", "low"];

const label = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
const priorityRank = (p: string) => {
  const i = PRIORITY_ORDER.indexOf((p || "").toLowerCase());
  return i === -1 ? PRIORITY_ORDER.length : i;
};

// ---- date helpers (local-time safe) ----
function startOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function endOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

// Page list with ellipses, e.g. 1 … 4 5 6 … 12
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Tickets() {
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // search & filters
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [priorityF, setPriorityF] = useState("all");
  const [tenantF, setTenantF] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  async function load() {
    const [{ data, error }, { data: t }] = await Promise.all([
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("tenants").select("id,name").order("name", { ascending: true }),
    ]);
    if (error) toast.error(error.message);
    setRows(data || []);
    const m: Record<string, any> = {};
    (t || []).forEach((x) => { m[x.id] = x; });
    setTenants(m);
    setTenantList(t || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    setUpdatingId(id);
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", id);
    setUpdatingId(null);
    if (error) return toast.error(error.message);
    toast.success(status === "resolved" ? "Ticket resolved" : `Marked ${label(status).toLowerCase()}`);
    load();
  }

  // options built from the loaded data
  const statuses = useMemo(() => {
    const found = Array.from(new Set(rows.map((r) => r.status).filter(Boolean))) as string[];
    return [...STATUS_ORDER, ...found.filter((s) => !STATUS_ORDER.includes(s)).sort()];
  }, [rows]);
  const priorities = useMemo(
    () => (Array.from(new Set(rows.map((r) => r.priority).filter(Boolean))) as string[])
      .sort((a, b) => priorityRank(a) - priorityRank(b)),
    [rows],
  );
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = dateFrom ? startOfLocalDay(dateFrom) : null;
    const to = dateTo ? endOfLocalDay(dateTo) : null;

    const out = rows.filter((r) => {
      if (term) {
        const hay = [r.subject, r.body, tenants[r.tenant_id]?.name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (statusF !== "all" && r.status !== statusF) return false;
      if (priorityF !== "all" && r.priority !== priorityF) return false;
      if (tenantF !== "all" && r.tenant_id !== tenantF) return false;
      const created = new Date(r.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });

    const time = (r: any) => new Date(r.created_at).getTime();
    out.sort((a, b) => {
      if (sort === "oldest") return time(a) - time(b);
      if (sort === "priority") return priorityRank(a.priority) - priorityRank(b.priority) || time(b) - time(a);
      return time(b) - time(a);
    });
    return out;
  }, [rows, tenants, q, statusF, priorityF, tenantF, dateFrom, dateTo, sort]);

  // Back to page 1 whenever search, filters or sort change
  useEffect(() => { setPage(1); }, [q, statusF, priorityF, tenantF, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const panelFilters =
    (priorityF !== "all" ? 1 : 0) + (tenantF !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const activeFilters = panelFilters + (q ? 1 : 0) + (statusF !== "all" ? 1 : 0);

  function clearFilters() {
    setQ(""); setStatusF("all"); setPriorityF("all"); setTenantF("all");
    setDateFrom(""); setDateTo(""); setSort("newest");
  }

  const statusClass = (s: string) =>
    s === "open" ? "bg-warning/15 text-warning"
    : s === "in_progress" ? "bg-primary/10 text-primary"
    : s === "resolved" ? "bg-success/15 text-success"
    : "bg-muted";

  const priorityClass = (p: string) => {
    const v = (p || "").toLowerCase();
    return v === "urgent" || v === "high" ? "bg-destructive/15 text-destructive" : "bg-muted";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search tickets"
            placeholder="Search subject, message, restaurant"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 pr-8"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status quick filters */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {["all", ...statuses].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusF === s ? "default" : "outline"}
            aria-pressed={statusF === s}
            onClick={() => setStatusF(s)}
          >
            {s === "all" ? "All" : label(s)}
            <span className="ml-1.5 text-xs opacity-70">{statusCounts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

      {/* Filters section: click header to open / close */}
      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="ticket-filters-panel"
          className="flex w-full items-center justify-between rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 font-medium">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {panelFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {panelFilters} applied
              </span>
            )}
          </span>
          {filtersOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </button>

        <div
          id="ticket-filters-panel"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3`}
        >
          <div className="space-y-1">
            <Label className="text-xs">Restaurant</Label>
            <Select value={tenantF} onValueChange={setTenantF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restaurants</SelectItem>
                {tenantList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Select value={priorityF} onValueChange={setPriorityF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {priorities.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="priority">Highest priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket-from" className="text-xs">Opened from</Label>
            <Input id="ticket-from" type="date" className="w-full min-w-[160px] pr-2" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket-to" className="text-xs">Opened to</Label>
            <Input id="ticket-to" type="date" className="w-full min-w-[160px] pr-2" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-sm text-muted-foreground">
          <span aria-live="polite">
            {filtered.length === rows.length
              ? `${rows.length} tickets`
              : `${filtered.length} of ${rows.length} tickets match`}
          </span>
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" /> Clear filters ({activeFilters})
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Restaurant</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading tickets…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {rows.length === 0 ? "No tickets yet." : "No tickets match these filters."}
                {activeFilters > 0 && <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>}
              </TableCell></TableRow>
            ) : paged.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium text-sm">{r.subject}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1" title={r.body}>{r.body}</div>
                </TableCell>
                <TableCell>{tenants[r.tenant_id]?.name || "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${priorityClass(r.priority)}`}>{label(r.priority) || "—"}</span>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${statusClass(r.status)}`}>{label(r.status)}</span>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "PP")}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {r.status !== "in_progress" && r.status !== "resolved" && (
                      <Button size="sm" variant="outline" disabled={updatingId === r.id} onClick={() => setStatus(r.id, "in_progress")}>
                        In progress
                      </Button>
                    )}
                    {r.status !== "resolved" ? (
                      <Button size="sm" disabled={updatingId === r.id} onClick={() => setStatus(r.id, "resolved")}>
                        Resolve
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={updatingId === r.id} onClick={() => setStatus(r.id, "open")}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers(page, totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`gap-${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === page ? "default" : "outline"}
                    aria-current={n === page ? "page" : undefined}
                    aria-label={`Page ${n}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        )}
      </Card>
    </div>
  );
}