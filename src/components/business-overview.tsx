import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import { setSelectedOutletId } from "@/lib/outlet-context";
import { useOutletContext } from "@/hooks/use-session";

type Row = {
  tenant_id: string; name: string; city: string | null; outlet_status: string;
  orders: number; sales: number; pending_orders: number; tables: number; active_qrs: number;
};

/**
 * Consolidated "all outlets" numbers for a multi-outlet owner, shown above the
 * current outlet's own dashboard. Renders nothing for single-outlet businesses
 * and for managers (the function only returns outlets the caller owns).
 */
export function BusinessOverview() {
  const { tenant, organization } = useOutletContext();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (organization?.business_type !== "MULTI_OUTLET") return;
    let cancelled = false;
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await (supabase as any).rpc("owner_outlet_stats", { p_since: today.toISOString() });
      if (!cancelled) setRows(((data ?? []) as any[]).map((r) => ({
        ...r, orders: Number(r.orders), sales: Number(r.sales), pending_orders: Number(r.pending_orders),
        tables: Number(r.tables), active_qrs: Number(r.active_qrs),
      })));
    })();
    return () => { cancelled = true; };
  }, [organization?.business_type]);

  if (!rows || rows.length < 2) return null;

  const active = rows.filter((r) => r.outlet_status === "ACTIVE");
  const totals = [
    { label: "Outlets", value: `${active.length} active / ${rows.length}` },
    { label: "Tables", value: rows.reduce((a, r) => a + r.tables, 0) },
    { label: "Orders today", value: rows.reduce((a, r) => a + r.orders, 0) },
    { label: "Sales today", value: money(rows.reduce((a, r) => a + r.sales, 0)) },
  ];

  function open(id: string) {
    if (id === tenant?.id) return;
    setSelectedOutletId(id);
    window.location.assign("/app");
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="font-medium">{organization?.name} · all outlets</div>
        <div className="text-xs text-muted-foreground">Today across every outlet. The cards below are for {tenant?.name}.</div>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {totals.map((t) => (
          <div key={t.label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="text-lg font-semibold mt-1">{t.value}</div>
          </div>
        ))}
      </div>
      <div className="divide-y">
        {rows.map((r) => (
          <button
            key={r.tenant_id}
            type="button"
            onClick={() => open(r.tenant_id)}
            className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 py-2.5 text-left text-sm hover:bg-accent/40"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">{r.name}</span>
              {r.city && <span className="text-xs text-muted-foreground">{r.city}</span>}
              {r.outlet_status !== "ACTIVE" && <Badge variant="secondary">{r.outlet_status === "PENDING_PAYMENT" ? "Payment due" : r.outlet_status.toLowerCase()}</Badge>}
            </span>
            <span className="flex items-center gap-4 text-muted-foreground">
              <span>{r.orders} orders</span>
              <span>{r.pending_orders} pending</span>
              <span className="font-medium text-foreground">{money(r.sales)}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
