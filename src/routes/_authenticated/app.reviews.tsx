import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MessageSquare, Search, Star } from "lucide-react";
import { format, formatDistanceToNow, subDays, subMonths, startOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE = 10;

const DATE_RANGES: { value: string; label: string; cutoff: () => Date }[] = [
  { value: "all", label: "All time", cutoff: () => new Date(0) },
  { value: "7d", label: "Last 7 days", cutoff: () => subDays(new Date(), 7) },
  { value: "15d", label: "Last 15 days", cutoff: () => subDays(new Date(), 15) },
  { value: "30d", label: "Last 30 days", cutoff: () => subDays(new Date(), 30) },
  { value: "1m", label: "Last month", cutoff: () => startOfMonth(subMonths(new Date(), 1)) },
  { value: "6m", label: "Last 6 months", cutoff: () => subMonths(new Date(), 6) },
];

export const Route = createFileRoute("/_authenticated/app/reviews")({
  component: Reviews,
});

type Review = {
  id: string;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

function Reviews() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");
  const [dateRange, setDateRange] = useState("1m");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        setRows((data as Review[]) || []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const dateFiltered = useMemo(() => {
    if (dateRange === "all") return rows;
    const range = DATE_RANGES.find((d) => d.value === dateRange);
    if (!range) return rows;
    const cutoff = range.cutoff();
    return rows.filter((r) => new Date(r.created_at) >= cutoff);
  }, [rows, dateRange]);

  const avg = dateFiltered.length ? dateFiltered.reduce((a, b) => a + b.rating, 0) / dateFiltered.length : 0;

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    dateFiltered.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) c[r.rating - 1] += 1;
    });
    return c;
  }, [dateFiltered]);

  const highlights = useMemo(() => {
    return {
      total: dateFiltered.length,
      positivePct: dateFiltered.length
        ? Math.round((dateFiltered.filter((r) => r.rating >= 4).length / dateFiltered.length) * 100)
        : 0,
      commented: dateFiltered.filter((r) => r.comment?.trim()).length,
    };
  }, [dateFiltered]);

  const rangeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of DATE_RANGES) {
      if (d.value === "all") { m[d.value] = rows.length; continue; }
      const cutoff = d.cutoff();
      m[d.value] = rows.filter((r) => new Date(r.created_at) >= cutoff).length;
    }
    return m;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = DATE_RANGES.find((d) => d.value === dateRange);
    const cutoff = range ? range.cutoff() : new Date(0);
    return rows.filter((r) => {
      if (filter !== "all" && r.rating !== filter) return false;
      if (dateRange !== "all" && new Date(r.created_at) < cutoff) return false;
      if (!q) return true;
      return (
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.comment || "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, dateRange, query]);

  useEffect(() => {
    setPage(1);
  }, [filter, dateRange, query]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paged = visible.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="text-sm text-muted-foreground">What guests are saying about your restaurant</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-10 w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label} ({rangeCounts[d.value] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or comment"
              aria-label="Search reviews"
              className="h-10 pl-9"
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[120px_minmax(0,1fr)_200px]">
          <div className="flex flex-col items-center justify-center border-border/60 text-center sm:border-r sm:pr-6">
            <div className="text-3xl font-semibold leading-none tracking-tight">
              {avg.toFixed(1)}
            </div>
            <Stars value={Math.round(avg)} className="mt-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              {dateFiltered.length} {dateFiltered.length === 1 ? "review" : "reviews"}
            </p>
          </div>

          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = counts[n - 1];
              const pct = dateFiltered.length ? (count / dateFiltered.length) * 100 : 0;
              return (
                <button
                  key={n}
                  onClick={() => setFilter(filter === n ? "all" : n)}
                  aria-pressed={filter === n}
                  className={`group flex w-full items-center gap-2.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/60 ${
                    filter === n ? "bg-muted" : ""
                  }`}
                >
                  <span className="flex w-7 shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                    {n}
                    <Star className="h-3 w-3 fill-warning text-warning" />
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-warning transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden flex-col justify-center gap-3 border-l border-border/60 pl-6 lg:flex">
            <Highlight label={DATE_RANGES.find(d => d.value === dateRange)?.label ?? "Total"} value={highlights.total} />
            <Highlight label="Rated 4★ and above" value={`${highlights.positivePct}%`} />
            <Highlight label="With comments" value={highlights.commented} />
          </div>
        </div>

        {(filter !== "all" || dateRange !== "all") && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-1.5 text-xs">
            <span className="text-muted-foreground">
              {[
                filter !== "all" ? `${filter}-star reviews` : "",
                dateRange !== "all" ? (DATE_RANGES.find(d => d.value === dateRange)?.label ?? "") : "",
              ].filter(Boolean).join(" · ") || "Filtered"}
            </span>
            <button
              onClick={() => { setFilter("all"); setDateRange("all"); }}
              className="font-medium text-primary hover:underline"
            >
              Clear filter
            </button>
          </div>
        )}
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn't load reviews: {error}
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-3.5 w-28 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                  <div className="h-3.5 w-20 rounded bg-muted" />
                </div>
                <div className="h-3 w-3/4 rounded bg-muted" />
              </div>
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-4 font-medium">
            {rows.length === 0 ? "No reviews yet" : "No matching reviews"}
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {rows.length === 0
              ? "Share your review QR code with guests to start collecting feedback."
              : "Try a different search term or clear the rating filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {paged.map((r) => (
            <Card key={r.id} className="p-4 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initial(r.customer_name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">
                        {r.customer_name || "Guest"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <time
                          dateTime={r.created_at}
                          title={format(new Date(r.created_at), "PPp")}
                        >
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </time>
                      </p>
                    </div>
                    <Stars value={r.rating} />
                  </div>

                  {r.comment && (
                    <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                      {r.comment}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {visible.length > PAGE_SIZE && (
            <nav
              aria-label="Reviews pagination"
              className="flex items-center justify-between gap-3 pt-2"
            >
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {start + 1}–{Math.min(start + PAGE_SIZE, visible.length)}
                </span>{" "}
                of <span className="tabular-nums">{visible.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs tabular-nums text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span
      className={`flex shrink-0 gap-0.5 ${className}`}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={`h-4 w-4 ${
            i <= value ? "fill-warning text-warning" : "fill-muted text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

function Highlight({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function initial(name: string | null) {
  const c = (name || "").trim().charAt(0).toUpperCase();
  return c || "G";
}