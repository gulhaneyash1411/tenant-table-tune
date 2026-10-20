import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, CreditCard, Plus, Trash2, ListOrdered, IndianRupee, Users, UtensilsCrossed, RefreshCw, Search, Download, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useOutletContext } from "@/hooks/use-session";
import { setSelectedOutletId, type OutletStatus } from "@/lib/outlet-context";
import { money } from "@/lib/format";
import { OutletManagers } from "@/components/outlet-managers";
import { GlobalMenuManager } from "@/components/global-menu";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager } from "@/components/admin/admin-ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/franchise")({ component: OutletsPage });

const STATUS_LABEL: Record<OutletStatus, string> = {
  ACTIVE: "Active",
  PENDING_PAYMENT: "Payment required",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const EMPTY = { name: "", address: "", city: "", state: "", pincode: "", contact: "", opening: "09:00", closing: "23:00" };

type Plan = { id: string; name: string; description: string | null; monthly_price: number; half_yearly_price: number | null; yearly_price: number | null };

type OutletRecord = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: OutletStatus;
  ordersInRange: number;
  revenueInRange: number;
  totalOrders: number;
  totalRevenue: number;
  customers: number;
  tables: number;
  menuItems: number;
};

function OutletsPage() {
  const { tenant, outlets, organization } = useOutletContext();
  const [step, setStep] = useState<"closed" | "details" | "subscribe">("closed");
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isMulti = organization?.business_type === "MULTI_OUTLET";

  useEffect(() => {
    if (step !== "subscribe" || plans.length) return;
    (async () => {
      const { data } = await supabase
        .from("subscription_plans").select("id,name,description,monthly_price,half_yearly_price,yearly_price")
        .eq("is_active", true).eq("is_free", false).order("monthly_price");
      setPlans(((data ?? []) as any[]).map((p) => ({ ...p, monthly_price: Number(p.monthly_price), half_yearly_price: p.half_yearly_price == null ? null : Number(p.half_yearly_price), yearly_price: p.yearly_price == null ? null : Number(p.yearly_price) })));
    })();
  }, [step, plans.length]);

  function switchTo(id: string, to = "/app") {
    setSelectedOutletId(id);
    window.location.assign(to);
  }

  function closeAdd() { setStep("closed"); setF(EMPTY); }

  async function createAndPay(planId?: string) {
    setSaving(true);
    const { data: created, error } = await (supabase as any).rpc("add_outlet", {
      p_name: f.name,
      p_address: f.address,
      p_city: f.city,
      p_state: f.state,
      p_pincode: f.pincode,
      p_contact: f.contact,
      p_opening_time: f.opening,
      p_closing_time: f.closing,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Outlet created — buy its subscription to open it.");
    if (created?.id) switchTo(created.id, planId ? `/app/subscription?plan=${planId}` : "/app/subscription");
    else window.location.reload();
  }

  async function deleteOutlet() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/owner-outlets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ action: "delete_outlet", tenant_id: toDelete.id, confirm_name: confirmName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not delete the outlet");
      toast.success(`${toDelete.name} deleted`);
      if (toDelete.id === tenant?.id) setSelectedOutletId(null);
      window.location.assign("/app/franchise");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the outlet");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Tabs defaultValue="outlets">
        <TabsList>
          <TabsTrigger value="outlets">Manage Outlets</TabsTrigger>
          <TabsTrigger value="records">All Outlets Records</TabsTrigger>
          <TabsTrigger value="global-menu">Global Menu</TabsTrigger>
        </TabsList>

        <TabsContent value="outlets">
          <div className="space-y-6 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {outlets.length} {outlets.length === 1 ? "outlet" : "outlets"}
                </p>
              </div>
              {step === "closed" && (
                <Button onClick={() => setStep("details")}><Plus className="mr-1 h-4 w-4" />Add outlet</Button>
              )}
            </div>

            {step === "details" && (
              <Card className="p-5">
                <form onSubmit={(e) => { e.preventDefault(); setStep("subscribe"); }} className="space-y-3">
                  <h2 className="font-semibold">Add new outlet · step 1 of 2</h2>
                  {!isMulti && (
                    <p className="text-xs text-muted-foreground">
                      Your account stays the same — your menu, tables and orders are untouched.
                    </p>
                  )}
                  <div><Label>Outlet name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ABC Pune" /></div>
                  <div><Label>Address</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>City</Label><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
                    <div><Label>State</Label><Input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></div>
                    <div><Label>Pincode</Label><Input value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} /></div>
                  </div>
                  <div><Label>Contact number</Label><Input type="tel" inputMode="numeric" maxLength={10} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digit phone number" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Opens</Label><Input type="time" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></div>
                    <div><Label>Closes</Label><Input type="time" value={f.closing} onChange={(e) => setF({ ...f, closing: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button>Continue to subscription</Button>
                    <Button type="button" variant="outline" onClick={closeAdd}>Cancel</Button>
                  </div>
                </form>
              </Card>
            )}

            {step === "subscribe" && (
              <Card className="space-y-4 p-5">
                <div>
                  <h2 className="font-semibold">Subscription required · step 2 of 2</h2>
                  <p className="text-sm text-muted-foreground">
                    <b>{f.name}</b> needs its own subscription. The outlet opens as soon as the subscription is bought
                    and its payment is approved — until then it stays closed and guests can't order from it.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={saving}
                      onClick={() => createAndPay(p.id)}
                      className="rounded-lg border p-3 text-left transition hover:border-primary hover:shadow-sm disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.name}</span>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="mt-1 text-lg font-semibold">{money(p.monthly_price)}<span className="text-xs font-normal text-muted-foreground"> / month</span></div>
                      {p.half_yearly_price ? <div className="text-xs text-muted-foreground">or {money(p.half_yearly_price)} / 6 months</div> : null}
                      {p.yearly_price ? <div className="text-xs text-muted-foreground">or {money(p.yearly_price)} / year</div> : null}
                      {p.description && <div className="mt-1 text-xs text-muted-foreground">{p.description}</div>}
                      <div className="mt-3 text-sm font-medium text-primary">{saving ? "Creating…" : "Buy now →"}</div>
                    </button>
                  ))}
                  {plans.length === 0 && <div className="text-sm text-muted-foreground">Loading plans…</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStep("details")} disabled={saving}>Back</Button>
                  <Button variant="ghost" onClick={closeAdd} disabled={saving}>Cancel</Button>
                </div>
                <p className="text-xs text-muted-foreground">Pick a plan to continue to payment.</p>
              </Card>
            )}

            <div className="space-y-3">
              {outlets.map((o) => {
                const status = ((o as any).outlet_status ?? "ACTIVE") as OutletStatus;
                const isCurrent = o.id === tenant?.id;
                return (
                  <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{o.name}</div>
                        <div className="text-xs text-muted-foreground">{[o.city, o.state].filter(Boolean).join(", ") || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{STATUS_LABEL[status]}</Badge>
                      {isCurrent ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Current</span>
                      ) : status === "ACTIVE" ? (
                        <Button size="sm" variant="outline" onClick={() => switchTo(o.id)}>Switch</Button>
                      ) : status === "PENDING_PAYMENT" ? (
                        <Button size="sm" onClick={() => switchTo(o.id, "/app/subscription")}>Buy subscription</Button>
                      ) : null}
                      {outlets.length > 1 && (
                        <Button
                          size="sm" variant="outline" className="text-destructive hover:text-destructive"
                          onClick={() => { setToDelete({ id: o.id, name: o.name }); setConfirmName(""); }}
                          aria-label={`Delete ${o.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            <OutletManagers outlets={outlets} />
          </div>
        </TabsContent>

        <TabsContent value="records">
          <AllOutletsRecords outlets={outlets} currentId={tenant?.id} onSwitch={switchTo} />
        </TabsContent>

        <TabsContent value="global-menu">
          <GlobalMenuManager outlets={outlets} organization={organization ?? undefined} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the outlet with its tables, QR codes, menu, orders, customers and kitchen login.
              Its manager loses access to it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Type <b>{toDelete?.name}</b> to confirm</Label>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive" onClick={deleteOutlet}
              disabled={deleting || confirmName.trim() !== (toDelete?.name ?? "").trim()}
            >
              {deleting ? "Deleting…" : "Delete outlet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All Outlets Records — cross-outlet overview
// ---------------------------------------------------------------------------

const iso = (d: Date) => format(d, "yyyy-MM-dd");

const DATE_PRESETS = [
  { label: "Today", range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { label: "7 days", range: () => ({ from: iso(subDays(new Date(), 6)), to: iso(new Date()) }) },
  { label: "30 days", range: () => ({ from: iso(subDays(new Date(), 29)), to: iso(new Date()) }) },
  { label: "This month", range: () => ({ from: iso(startOfMonth(new Date())), to: iso(new Date()) }) },
] as const;

function exportToExcel(records: OutletRecord[], totals: ReturnType<typeof sumRecords>, dateLabel: string, uniqueMenu?: number) {
  const headers = ["Outlet", "Address", "City", "State", "Status", "Orders", "Customers", "Tables", "Revenue"];
  const rows = records.map((r) => [
    r.name,
    r.address || "",
    r.city || "",
    r.state || "",
    STATUS_LABEL[r.status],
    r.ordersInRange,
    r.customers,
    r.tables,
    r.revenueInRange,
  ]);
  if (records.length > 1) {
    rows.push([
      "ALL OUTLETS",
      "",
      "",
      "",
      "",
      totals.ordersInRange,
      totals.customers,
      totals.tables,
      totals.revenueInRange,
    ]);
  }

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outlets-records-${dateLabel || "all-time"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sumRecords(records: OutletRecord[]) {
  return records.reduce(
    (acc, r) => ({
      ordersInRange: acc.ordersInRange + r.ordersInRange,
      revenueInRange: acc.revenueInRange + r.revenueInRange,
      totalOrders: acc.totalOrders + r.totalOrders,
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      customers: acc.customers + r.customers,
      tables: acc.tables + r.tables,
      menuItems: acc.menuItems + r.menuItems,
    }),
    { ordersInRange: 0, revenueInRange: 0, totalOrders: 0, totalRevenue: 0, customers: 0, tables: 0, menuItems: 0 },
  );
}

function AllOutletsRecords({ outlets, currentId, onSwitch }: {
  outlets: any[];
  currentId: string | undefined;
  onSwitch: (id: string) => void;
}) {
  const [records, setRecords] = useState<OutletRecord[]>([]);
  const [uniqueMenuTotal, setUniqueMenuTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(iso(new Date()));
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const [activePreset, setActivePreset] = useState("Today");

  function applyPreset(p: typeof DATE_PRESETS[number]) {
    const r = p.range();
    setDateFrom(r.from);
    setDateTo(r.to);
    setActivePreset(p.label);
  }

  async function load() {
    setLoading(true);
    const ids = outlets.map((o) => o.id);
    if (ids.length === 0) { setLoading(false); return; }

    const hasDateFilter = dateFrom && dateTo;
    const rangeStart = hasDateFilter ? new Date(dateFrom + "T00:00:00").toISOString() : undefined;
    const rangeEnd = hasDateFilter ? new Date(dateTo + "T23:59:59").toISOString() : undefined;

    let rangeOrdersQuery = supabase.from("orders").select("tenant_id, total, payment_status").in("tenant_id", ids);
    if (rangeStart && rangeEnd) {
      rangeOrdersQuery = rangeOrdersQuery.gte("created_at", rangeStart).lte("created_at", rangeEnd);
    }

    const [
      { data: allOrders },
      { data: rangeOrders },
      { data: customerCounts },
      { data: tableCounts },
      { data: menuCounts },
    ] = await Promise.all([
      supabase.from("orders").select("tenant_id, total, payment_status").in("tenant_id", ids),
      rangeOrdersQuery,
      supabase.from("customers").select("tenant_id").in("tenant_id", ids),
      supabase.from("restaurant_tables").select("tenant_id").in("tenant_id", ids),
      (supabase as any).from("menu_items").select("id, tenant_id, global_item_id").in("tenant_id", ids),
    ]);

    const allMenu = (menuCounts || []) as { id: string; tenant_id: string; global_item_id: string | null }[];
    const seen = new Set<string>();
    let uniqueCount = 0;
    for (const m of allMenu) {
      const key = m.global_item_id || m.id;
      if (!seen.has(key)) { seen.add(key); uniqueCount++; }
    }
    setUniqueMenuTotal(uniqueCount);

    const result: OutletRecord[] = outlets.map((o) => {
      const status = ((o as any).outlet_status ?? "ACTIVE") as OutletStatus;
      const oAll = (allOrders || []).filter((r) => r.tenant_id === o.id);
      const oRange = (rangeOrders || []).filter((r) => r.tenant_id === o.id);
      const paidAll = oAll.filter((r) => r.payment_status === "paid");
      const paidRange = oRange.filter((r) => r.payment_status === "paid");

      return {
        id: o.id,
        name: o.name,
        address: (o as any).address ?? null,
        city: o.city,
        state: o.state,
        status,
        ordersInRange: oRange.length,
        revenueInRange: paidRange.reduce((a, r) => a + Number(r.total || 0), 0),
        totalOrders: oAll.length,
        totalRevenue: paidAll.reduce((a, r) => a + Number(r.total || 0), 0),
        customers: (customerCounts || []).filter((r) => r.tenant_id === o.id).length,
        tables: (tableCounts || []).filter((r) => r.tenant_id === o.id).length,
        menuItems: (menuCounts || []).filter((r: any) => r.tenant_id === o.id).length,
      };
    });

    setRecords(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, [outlets.length, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q) || (r.state || "").toLowerCase().includes(q),
    );
  }, [records, search]);

  const totals = sumRecords(filtered);

  const dateLabel = dateFrom && dateTo
    ? dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`
    : "all-time";

  const rangeLabel = dateFrom && dateTo
    ? dateFrom === dateTo ? format(new Date(dateFrom), "dd MMM yyyy") : `${format(new Date(dateFrom), "dd MMM")} – ${format(new Date(dateTo), "dd MMM yyyy")}`
    : "All time";

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </Card>
      </div>
    );
  }

  const summaryCards = [
    { icon: ListOrdered, label: `Orders (${rangeLabel})`, value: totals.ordersInRange },
    { icon: IndianRupee, label: `Revenue (${rangeLabel})`, value: money(totals.revenueInRange) },
    { icon: Users, label: "Total customers", value: totals.customers },
    { icon: UtensilsCrossed, label: "Total menu items", value: uniqueMenuTotal },
  ];

  return (
    <div className="space-y-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">All outlets overview</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, totals, dateLabel, uniqueMenuTotal)}>
            <Download className="mr-1 h-3.5 w-3.5" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh
          </Button>
        </div>
      </div>

      {/* Date presets + custom date range */}
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground mr-1" />
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={activePreset === p.label ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                className="h-8 w-[140px] text-xs"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(""); }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                className="h-8 w-[140px] text-xs"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(""); }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold mt-2">{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Table with search */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Per-outlet breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click an outlet row to switch to its dashboard
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search outlets…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
        <div className="overflow-auto max-h-[420px]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="pl-4">Outlet</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right whitespace-nowrap">Orders</TableHead>
                <TableHead className="text-right whitespace-nowrap">Customers</TableHead>
                <TableHead className="text-right whitespace-nowrap">Tables</TableHead>
                <TableHead className="text-right whitespace-nowrap pr-4">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {search ? "No outlets match your search." : "No outlet data available."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.slice((page - 1) * 10, page * 10).map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => r.status === "ACTIVE" && onSwitch(r.id)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-sm">
                          {r.name}
                          {r.id === currentId && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(current)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                    {r.address || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{r.ordersInRange}</TableCell>
                  <TableCell className="text-right">{r.customers}</TableCell>
                  <TableCell className="text-right">{r.tables}</TableCell>
                  <TableCell className="text-right font-medium pr-4">{money(r.revenueInRange)}</TableCell>
                </TableRow>
              ))}
              {filtered.length > 1 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell className="pl-4">All outlets</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right">{totals.ordersInRange}</TableCell>
                  <TableCell className="text-right">{totals.customers}</TableCell>
                  <TableCell className="text-right">{totals.tables}</TableCell>
                  <TableCell className="text-right pr-4">{money(totals.revenueInRange)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      {filtered.length > 0 && (
        <Pager page={page} total={filtered.length} pageSize={10} onPage={setPage} />
      )}
    </div>
  );
}
