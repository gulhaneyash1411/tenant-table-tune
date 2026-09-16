import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Search, X, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: Audit });

type SortKey = "newest" | "oldest";

const PAGE_SIZE = 10;
const MAX_ROWS = 1000;     // latest events loaded for browsing
const ENTITY_TABS = 6;     // most common entities shown as quick buttons
const SYSTEM_ACTOR = "__system__";

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

const shortId = (id?: string | null) => (id ? id.slice(0, 8) : "");

function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // search & filters
  const [q, setQ] = useState("");
  const [entityF, setEntityF] = useState("all");
  const [actionF, setActionF] = useState("all");
  const [actorF, setActorF] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows(data || []);
        setLoading(false);
      });
  }, []);

  // options built from the loaded data
  const entityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { if (r.entity) c[r.entity] = (c[r.entity] || 0) + 1; });
    return c;
  }, [rows]);
  const entities = useMemo(() => Object.keys(entityCounts).sort(), [entityCounts]);
  const topEntities = useMemo(
    () => Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, ENTITY_TABS).map(([e]) => e),
    [entityCounts],
  );
  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action).filter(Boolean))).sort() as string[],
    [rows],
  );
  const actors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = dateFrom ? startOfLocalDay(dateFrom) : null;
    const to = dateTo ? endOfLocalDay(dateTo) : null;

    const out = rows.filter((r) => {
      if (term) {
        const hay = [r.action, r.entity, r.entity_id, r.actor_id, r.ip]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (entityF !== "all" && r.entity !== entityF) return false;
      if (actionF !== "all" && r.action !== actionF) return false;
      if (actorF === SYSTEM_ACTOR && r.actor_id) return false;
      if (actorF !== "all" && actorF !== SYSTEM_ACTOR && r.actor_id !== actorF) return false;
      const created = new Date(r.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });

    if (sort === "oldest") {
      out.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    }
    return out;
  }, [rows, q, entityF, actionF, actorF, dateFrom, dateTo, sort]);

  // Back to page 1 whenever search, filters or sort change
  useEffect(() => { setPage(1); }, [q, entityF, actionF, actorF, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const panelFilters =
    (entityF !== "all" ? 1 : 0) + (actionF !== "all" ? 1 : 0) + (actorF !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const activeFilters = panelFilters + (q ? 1 : 0);

  function clearFilters() {
    setQ(""); setEntityF("all"); setActionF("all"); setActorF("all");
    setDateFrom(""); setDateTo(""); setSort("newest");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search audit logs"
            placeholder="Search action, entity, ID, actor, IP"
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

      {/* Entity quick filters */}
      {topEntities.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by entity">
          <Button
            size="sm"
            variant={entityF === "all" ? "default" : "outline"}
            aria-pressed={entityF === "all"}
            onClick={() => setEntityF("all")}
          >
            All <span className="ml-1.5 text-xs opacity-70">{rows.length}</span>
          </Button>
          {topEntities.map((e) => (
            <Button
              key={e}
              size="sm"
              variant={entityF === e ? "default" : "outline"}
              aria-pressed={entityF === e}
              onClick={() => setEntityF(e)}
            >
              {e} <span className="ml-1.5 text-xs opacity-70">{entityCounts[e]}</span>
            </Button>
          ))}
        </div>
      )}

      {/* Filters section: click header to open / close */}
      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="audit-filters-panel"
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
          id="audit-filters-panel"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3`}
        >
          <div className="space-y-1">
            <Label className="text-xs">Entity</Label>
            <Select value={entityF} onValueChange={setEntityF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {entities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={actionF} onValueChange={setActionF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => <SelectItem key={a} value={a}><span className="font-mono text-xs">{a}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Actor</Label>
            <Select value={actorF} onValueChange={setActorF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actors</SelectItem>
                <SelectItem value={SYSTEM_ACTOR}>System</SelectItem>
                {actors.map((a) => <SelectItem key={a} value={a}><span className="font-mono text-xs">{shortId(a)}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from" className="text-xs">From</Label>
            <Input id="audit-from" type="date" className="w-full min-w-[160px] pr-2" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to" className="text-xs">To</Label>
            <Input id="audit-to" type="date" className="w-full min-w-[160px] pr-2" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-sm text-muted-foreground">
          <span aria-live="polite">
            {filtered.length === rows.length
              ? `${rows.length} events`
              : `${filtered.length} of ${rows.length} events match`}
            {rows.length >= MAX_ROWS && ` (latest ${MAX_ROWS} loaded)`}
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
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading audit events…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {rows.length === 0 ? "No audit events recorded." : "No events match these filters."}
                {activeFilters > 0 && <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>}
              </TableCell></TableRow>
            ) : paged.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "PPp")}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell className="text-xs">
                  {r.entity} {r.entity_id && <span className="font-mono text-muted-foreground" title={r.entity_id}>#{shortId(r.entity_id)}</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {r.actor_id
                    ? <span className="font-mono" title={r.actor_id}>{shortId(r.actor_id)}</span>
                    : <span className="text-muted-foreground">system</span>}
                </TableCell>
                <TableCell className="text-xs font-mono">{r.ip || "—"}</TableCell>
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