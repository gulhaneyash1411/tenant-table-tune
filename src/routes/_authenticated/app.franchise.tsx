import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOutletContext } from "@/hooks/use-session";
import { setSelectedOutletId, type OutletStatus } from "@/lib/outlet-context";
import { money } from "@/lib/format";
import { OutletManagers } from "@/components/outlet-managers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Reached from Settings → Outlets (and the outlet switcher). The route path is
// kept as /app/franchise because it is already registered in the route tree.
export const Route = createFileRoute("/_authenticated/app/franchise")({ component: OutletsPage });

const STATUS_LABEL: Record<OutletStatus, string> = {
  ACTIVE: "Active",
  PENDING_PAYMENT: "Payment required",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const EMPTY = { name: "", address: "", city: "", state: "", pincode: "", contact: "", opening: "09:00", closing: "23:00" };

type Plan = { id: string; name: string; description: string | null; monthly_price: number; half_yearly_price: number | null; yearly_price: number | null };

function OutletsPage() {
  const { tenant, outlets, organization } = useOutletContext();
  // Adding an outlet is two steps: its details, then the subscription it needs.
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

  // The outlet is only created once the owner commits to buying its subscription,
  // and it stays closed (PENDING_PAYMENT) until that payment is approved.
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
    <div className="mx-auto max-w-3xl space-y-6">
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
