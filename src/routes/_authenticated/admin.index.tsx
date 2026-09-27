import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Building2, Clock, CircleDollarSign, ListOrdered, Users, Star,
  Search, X, ChevronLeft, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDash });

const PAGE_SIZE = 10;

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

const statusClass = (s: string) =>
  s === "approved" ? "bg-success/15 text-success"
  : s === "pending" ? "bg-warning/15 text-warning"
  : s === "suspended" ? "bg-destructive/15 text-destructive"
  : "bg-muted";

function AdminDash() {
  const [s, setS] = useState<any>({});
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Recent signups: search & pagination
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const [{ data: t, error: tErr }, { data: subs }, { count: orderCount }, { count: custCount }, { count: revCount }] = await Promise.all([
        supabase
          .from("tenants")
          .select("id,status,name,city,created_at,owner_email,owner_name,owner_phone")
          .order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*, subscription_plans(monthly_price)"),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("reviews").select("id", { count: "exact", head: true }),
      ]);
      if (tErr) toast.error(tErr.message);
      const list = t || [];
      const mrr = (subs || []).filter((x: any) => x.status === "active").reduce((a: number, b: any) => a + Number(b.subscription_plans?.monthly_price || 0), 0);
      setTenants(list);
      setS({
        total: list.length,
        active: list.filter((x) => x.status === "approved").length,
        pending: list.filter((x) => x.status === "pending").length,
        suspended: list.filter((x) => x.status === "suspended").length,
        mrr, arr: mrr * 12,
        orders: orderCount ?? 0, customers: custCount ?? 0, reviews: revCount ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  const kpis = [
    { icon: Building2, label: "Restaurants", value: s.total },
    { icon: Clock, label: "Pending approvals", value: s.pending },
    { icon: CircleDollarSign, label: "MRR", value: money(s.mrr || 0) },
    { icon: CircleDollarSign, label: "ARR", value: money(s.arr || 0) },
    { icon: ListOrdered, label: "Total orders", value: s.orders },
    { icon: Users, label: "Total customers", value: s.customers },
    { icon: Star, label: "Reviews", value: s.reviews },
    { icon: Building2, label: "Suspended", value: s.suspended },
  ];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter((t) =>
      [t.name, t.owner_name, t.owner_email, t.owner_phone, t.city]
        .filter(Boolean).join(" ").toLowerCase().includes(term),
    );
  }, [tenants, q]);

  // Back to page 1 whenever the search changes
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform overview</h1>
      <div className="grid gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{k.label}</span><k.icon className="h-4 w-4" /></div>
            <div className="text-2xl font-semibold mt-2">{k.value ?? 0}</div>
          </Card>
        ))}
      </div>

      <section className="space-y-4" aria-labelledby="recent-signups-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-signups-heading" className="text-lg font-semibold">Recent signups</h2>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search signups"
              placeholder="Search name, owner, email, phone, city"
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

        {/* Signup list */}
        <Card>
          <div className="divide-y">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading signups…</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {tenants.length === 0 ? "No restaurants have signed up yet." : `No signups match "${q}".`}
                {q && <Button variant="link" size="sm" onClick={() => setQ("")}>Clear search</Button>}
              </div>
            ) : paged.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[t.owner_email, t.city].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(t.created_at), "PP")}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusClass(t.status)}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>

          {!loading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
              <span className="text-muted-foreground" aria-live="polite">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <nav className="flex items-center gap-1" aria-label="Signups pagination">
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
      </section>
    </div>
  );
}