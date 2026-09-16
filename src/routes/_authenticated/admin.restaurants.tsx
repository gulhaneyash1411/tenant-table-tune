import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, differenceInCalendarDays, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/restaurants")({ component: Restaurants });

type Status = "approved" | "pending" | "rejected" | "suspended";
type SubState = "active" | "expiring" | "expired" | "none";
type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "expiry_asc";

const EXPIRING_DAYS = 7;
const PAGE_SIZE = 10;
const STATUSES: Status[] = ["pending", "approved", "suspended", "rejected"];

function subState(sub: any): SubState {
  if (!sub?.current_period_end) return "none";
  const days = differenceInCalendarDays(new Date(sub.current_period_end), new Date());
  if (days < 0) return "expired";
  if (days <= EXPIRING_DAYS) return "expiring";
  return "active";
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

function Restaurants() {
  const [rows, setRows] = useState<any[]>([]);
  const [subs, setSubs] = useState<Record<string, any>>({});
  const [plans, setPlans] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Search & filters
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<"all" | Status>("all");
  const [planF, setPlanF] = useState<string>("all");
  const [cityF, setCityF] = useState<string>("all");
  const [subF, setSubF] = useState<"all" | SubState>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [notifTarget, setNotifTarget] = useState<any | null>(null);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: t, error: te }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*"),
      supabase.from("subscription_plans").select("*"),
    ]);
    if (te) toast.error(te.message);
    setRows(t || []);
    const sMap: Record<string, any> = {};
    (s || []).forEach((x: any) => { sMap[x.tenant_id] = x; });
    setSubs(sMap);
    const pMap: Record<string, any> = {};
    (p || []).forEach((x: any) => { pMap[x.id] = x; });
    setPlans(pMap);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(t: any, status: Status) {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    load();
  }

  async function sendNotif() {
    if (!notifTarget) return;
    if (!notifTitle.trim() || !notifBody.trim()) return toast.error("Add a title and message");
    const { error } = await supabase.from("notifications").insert({
      recipient_id: notifTarget.owner_id, tenant_id: notifTarget.id,
      title: notifTitle, body: notifBody, kind: "admin_message",
    });
    if (error) return toast.error(error.message);
    toast.success("Notification sent");
    setNotifTarget(null); setNotifTitle(""); setNotifBody("");
  }

  const cities = useMemo(
    () => Array.from(new Set(rows.map(r => r.city).filter(Boolean))).sort() as string[],
    [rows]
  );
  const planList = useMemo(() => Object.values(plans), [plans]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    STATUSES.forEach(s => { c[s] = rows.filter(r => r.status === s).length; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = fromDate ? startOfDay(parseISO(fromDate)) : null;
    const to = toDate ? endOfDay(parseISO(toDate)) : null;

    const out = rows.filter(r => {
      const sub = subs[r.id];
      if (term) {
        const hay = [r.name, r.owner_name, r.owner_email, r.owner_phone, r.city]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (statusF !== "all" && r.status !== statusF) return false;
      if (planF !== "all") {
        if (planF === "none" ? !!sub : sub?.plan_id !== planF) return false;
      }
      if (cityF !== "all" && r.city !== cityF) return false;
      if (subF !== "all" && subState(sub) !== subF) return false;
      const created = new Date(r.created_at);
      if (from && isBefore(created, from)) return false;
      if (to && isAfter(created, to)) return false;
      return true;
    });

    const expiry = (r: any) => subs[r.id]?.current_period_end ? new Date(subs[r.id].current_period_end).getTime() : Infinity;
    out.sort((a, b) => {
      switch (sort) {
        case "oldest": return +new Date(a.created_at) - +new Date(b.created_at);
        case "name_asc": return (a.name || "").localeCompare(b.name || "");
        case "name_desc": return (b.name || "").localeCompare(a.name || "");
        case "expiry_asc": return expiry(a) - expiry(b);
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return out;
  }, [rows, subs, q, statusF, planF, cityF, subF, fromDate, toDate, sort]);

  // Reset to page 1 whenever search, filters or sort change
  useEffect(() => { setPage(1); }, [q, statusF, planF, cityF, subF, fromDate, toDate, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Keep page in range if the list shrinks (e.g. after a status change)
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const activeFilters =
    (q ? 1 : 0) + (statusF !== "all" ? 1 : 0) + (planF !== "all" ? 1 : 0) + (cityF !== "all" ? 1 : 0) +
    (subF !== "all" ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

  const panelFilters =
    (planF !== "all" ? 1 : 0) + (cityF !== "all" ? 1 : 0) + (subF !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  function clearFilters() {
    setQ(""); setStatusF("all"); setPlanF("all"); setCityF("all");
    setSubF("all"); setFromDate(""); setToDate(""); setSort("newest");
  }

  const statusClass = (s: string) =>
    s === "approved" ? "bg-success/15 text-success"
    : s === "pending" ? "bg-warning/15 text-warning"
    : s === "suspended" ? "bg-destructive/15 text-destructive"
    : "bg-muted";

  const subBadge = (sub: any) => {
    const st = subState(sub);
    if (st === "none") return "—";
    const d = format(new Date(sub.current_period_end), "PP");
    const cls = st === "expired" ? "text-destructive" : st === "expiring" ? "text-warning" : "";
    return <span className={cls}>{d}{st === "expired" ? " (expired)" : st === "expiring" ? " (soon)" : ""}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search restaurants"
            placeholder="Search name, owner, email, phone, city"
            value={q}
            onChange={e => setQ(e.target.value)}
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
        {(["all", ...STATUSES] as const).map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusF === s ? "default" : "outline"}
            aria-pressed={statusF === s}
            onClick={() => setStatusF(s)}
            className="capitalize"
          >
            {s} <span className="ml-1.5 text-xs opacity-70">{statusCounts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

      {/* Filters section: click header to open / close */}
      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          aria-expanded={filtersOpen}
          aria-controls="filters-panel"
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
          id="filters-panel"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`}
        >
          <div className="space-y-1">
            <Label className="text-xs">Plan</Label>
            <Select value={planF} onValueChange={setPlanF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="none">No plan</SelectItem>
                {planList.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Select value={cityF} onValueChange={setCityF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subscription</Label>
            <Select value={subF} onValueChange={v => setSubF(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring">Expiring in {EXPIRING_DAYS} days</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="none">No subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">Registered from</Label>
            <Input id="from" type="date" className="w-full min-w-[160px] pr-2" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">Registered to</Label>
            <Input id="to" type="date" className="w-full min-w-[160px] pr-2" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="name_desc">Name Z–A</SelectItem>
                <SelectItem value="expiry_asc">Expiry soonest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex min-h-10 items-center justify-between border-t px-3 py-1.5 text-sm text-muted-foreground">
          <span aria-live="polite">
            {filtered.length === rows.length
              ? `${rows.length} restaurants`
              : `${filtered.length} of ${rows.length} restaurants match`}
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
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead>
            <TableHead>Plan</TableHead><TableHead>Expires</TableHead>
            <TableHead>Registered</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading restaurants…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                No restaurants match these filters.
                {activeFilters > 0 && <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>}
              </TableCell></TableRow>
            ) : paged.map(r => {
              const sub = subs[r.id];
              const plan = sub ? plans[sub.plan_id] : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><div className="text-sm">{r.owner_name}</div><div className="text-xs text-muted-foreground">{r.owner_email}</div></TableCell>
                  <TableCell className="text-sm">{r.owner_phone || "—"}</TableCell>
                  <TableCell>{r.city || "—"}</TableCell>
                  <TableCell>{plan ? <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{plan.name}</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{subBadge(sub)}</TableCell>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "PP")}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded ${statusClass(r.status)}`}>{r.status}</span></TableCell>
                  <TableCell><div className="flex gap-1 flex-wrap">
                    {r.status === "pending" && <>
                      <Button size="sm" onClick={() => setStatus(r, "approved")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(r, "rejected")}>Reject</Button>
                    </>}
                    {r.status === "approved" && <Button size="sm" variant="outline" onClick={() => setStatus(r, "suspended")}>Suspend</Button>}
                    {(r.status === "suspended" || r.status === "rejected") && <Button size="sm" onClick={() => setStatus(r, "approved")}>Activate</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setNotifTarget(r)}>Notify</Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 1} aria-label="Previous page">
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
                )
              )}
              <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        )}
      </Card>

      <Dialog open={!!notifTarget} onOpenChange={o => !o && setNotifTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send notification to {notifTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="nt">Title</Label><Input id="nt" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} /></div>
            <div><Label htmlFor="nb">Message</Label><Textarea id="nb" value={notifBody} onChange={e => setNotifBody(e.target.value)} rows={4} /></div>
            <Button onClick={sendNotif}>Send notification</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}