import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Check, CreditCard, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/subscription")({ component: SubscriptionPage });

function SubscriptionPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [cycle, setCycle] = useState<"monthly"|"yearly">("monthly");
  const [confirm, setConfirm] = useState<any>(null);
  const [pay, setPay] = useState<any>({ card: "4242 4242 4242 4242", exp: "12/28", cvv: "123" });
  const [processing, setProcessing] = useState(false);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("*").eq("owner_id", u.user!.id).maybeSingle();
    setTenant(t);
    const [{ data: pl }, { data: sub }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("subscriptions").select("*, plan:subscription_plans(*)").eq("tenant_id", t!.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPlans(pl || []); setCurrent(sub);
  }
  useEffect(() => { load(); }, []);

  async function subscribe() {
    if (!confirm || !tenant) return;
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1200));
    const amount = cycle === "yearly" ? Number(confirm.yearly_price) : Number(confirm.monthly_price);
    const now = new Date();
    const periodEnd = new Date(now);
    if (cycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear()+1);
    else periodEnd.setMonth(periodEnd.getMonth()+1);
    // create subscription record
    const { data: sub, error: sErr } = await supabase.from("subscriptions").insert({
      tenant_id: tenant.id, plan_id: confirm.id, status: "active",
      current_period_start: now.toISOString(), current_period_end: periodEnd.toISOString(),
    }).select().single();
    if (sErr) { setProcessing(false); return toast.error(sErr.message); }
    // mock payment + invoice
    await (supabase as any).from("mock_payments").insert({
      tenant_id: tenant.id, plan_id: confirm.id, cycle, amount, status: "succeeded", method: "card",
      card_last4: pay.card.replace(/\s+/g,"").slice(-4),
    });
    // NOTE: `plan` and `billing_cycle` are also stamped onto the invoice here
    // so it shows up correctly (plan name + cycle) on the admin Billing page
    // automatically, instead of falling back to the "Free trial" label that
    // page uses when an invoice has no `plan` set. Cast as `any` for the same
    // reason as the admin page — these columns aren't in the generated types yet.
    await (supabase as any).from("invoices").insert({
      tenant_id: tenant.id,
      subscription_id: sub.id,
      amount,
      tax: Math.round(amount * 0.18),
      status: "paid",
      issued_at: now.toISOString(),
      paid_at: now.toISOString(),
      invoice_number: "INV-" + Date.now().toString().slice(-8),
      plan: confirm.name,
      billing_cycle: cycle,
    });
    setProcessing(false); setConfirm(null);
    toast.success(`Subscribed to ${confirm.name} (${cycle})`);
    load();
  }

  const currentPlanId = current?.plan_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><CreditCard className="h-6 w-6"/><h1 className="text-2xl font-semibold">Subscription</h1></div>
      {current && (
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Current plan</div>
            <div className="text-xl font-semibold flex items-center gap-2">{current.plan?.name} <Badge variant="secondary">{current.status}</Badge></div>
            <div className="text-sm text-muted-foreground mt-1">Renews {format(new Date(current.current_period_end), "PP")}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Started</div>
            <div>{format(new Date(current.current_period_start), "PP")}</div>
          </div>
        </Card>
      )}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border p-1 bg-muted/40">
          <button onClick={()=>setCycle("monthly")} className={`px-3 py-1 text-sm rounded ${cycle==="monthly"?"bg-background shadow":""}`}>Monthly</button>
          <button onClick={()=>setCycle("yearly")} className={`px-3 py-1 text-sm rounded ${cycle==="yearly"?"bg-background shadow":""}`}>Yearly <span className="text-xs text-success">−17%</span></button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {plans.map(p => {
          const price = cycle === "yearly" ? p.yearly_price : p.monthly_price;
          const isCurrent = p.id === currentPlanId;
          return (
            <Card key={p.id} className={`p-5 flex flex-col ${isCurrent ? "border-primary ring-1 ring-primary" : ""}`}>
              <div className="flex items-center justify-between"><div className="font-semibold text-lg">{p.name}</div>{isCurrent && <Badge>Current</Badge>}</div>
              <div className="text-xs text-muted-foreground min-h-[32px]">{p.description}</div>
              <div className="text-2xl font-semibold mt-3">{money(Number(price))}<span className="text-xs text-muted-foreground font-normal">/{cycle==="yearly"?"yr":"mo"}</span></div>
              <ul className="text-xs space-y-1 mt-3 flex-1">
                {p.max_tables && <li className="flex gap-1"><Check className="h-3 w-3 text-success"/>{p.max_tables} tables</li>}
                {p.max_orders_month && <li className="flex gap-1"><Check className="h-3 w-3 text-success"/>{p.max_orders_month} orders/mo</li>}
                {p.max_menu_items && <li className="flex gap-1"><Check className="h-3 w-3 text-success"/>{p.max_menu_items} menu items</li>}
                {p.max_staff && <li className="flex gap-1"><Check className="h-3 w-3 text-success"/>{p.max_staff} staff</li>}
              </ul>
              <Button className="mt-4 w-full" variant={isCurrent?"outline":"default"} disabled={isCurrent} onClick={()=>setConfirm(p)}>
                {isCurrent ? "Current plan" : currentPlanId ? (Number(price) > Number(cycle==="yearly"?plans.find(x=>x.id===currentPlanId)?.yearly_price:plans.find(x=>x.id===currentPlanId)?.monthly_price) ? "Upgrade" : "Switch plan") : "Subscribe"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o)=>!o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/>Checkout — {confirm?.name}</DialogTitle>
            <DialogDescription>Test mode — no real charge. Any card details accepted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3 text-sm flex justify-between"><span>{confirm?.name} · {cycle}</span><span className="font-semibold">{money(Number(cycle==="yearly"?confirm?.yearly_price:confirm?.monthly_price))}</span></div>
            <div><Label>Card number</Label><Input value={pay.card} onChange={e=>setPay({...pay,card:e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Expiry</Label><Input value={pay.exp} onChange={e=>setPay({...pay,exp:e.target.value})}/></div>
              <div><Label>CVV</Label><Input value={pay.cvv} onChange={e=>setPay({...pay,cvv:e.target.value})}/></div>
            </div>
          </div>
          <DialogFooter><Button onClick={subscribe} disabled={processing}>{processing?"Processing…":`Pay ${money(Number(cycle==="yearly"?confirm?.yearly_price:confirm?.monthly_price))}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}