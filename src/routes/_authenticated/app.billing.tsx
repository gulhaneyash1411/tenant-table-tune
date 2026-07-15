import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/billing")({ component: BillingPage });

function BillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("id").eq("owner_id", u.user!.id).maybeSingle();
    if (!t) return;
    const [{ data: inv }, { data: pay }] = await Promise.all([
      supabase.from("invoices").select("*").eq("tenant_id", t.id).order("issued_at", { ascending: false }).limit(50),
      (supabase as any).from("mock_payments").select("*, plan:subscription_plans(name)").order("created_at", { ascending: false }).limit(50),
    ]);
    setInvoices(inv || []); setPayments(pay || []);
  })(); }, []);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><Receipt className="h-6 w-6"/><h1 className="text-2xl font-semibold">Billing</h1></div>
      <Card className="p-0 overflow-hidden">
        <div className="p-4 font-medium border-b">Invoices</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Invoice #</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Tax</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id} className="border-t">
                <td className="p-3 font-mono text-xs">{i.invoice_number || i.id.slice(0,8)}</td>
                <td className="p-3">{format(new Date(i.issued_at), "PP")}</td>
                <td className="p-3 font-medium">{money(Number(i.amount))}</td>
                <td className="p-3">{money(Number(i.tax||0))}</td>
                <td className="p-3"><Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge></td>
              </tr>
            ))}
            {invoices.length===0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No invoices yet</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="p-0 overflow-hidden">
        <div className="p-4 font-medium border-b">Payment history <span className="text-xs text-muted-foreground ml-1">(test mode)</span></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Ref</th><th className="p-3">Date</th><th className="p-3">Plan</th><th className="p-3">Cycle</th><th className="p-3">Card</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-mono text-xs">{p.gateway_ref}</td>
                <td className="p-3">{format(new Date(p.created_at), "PP p")}</td>
                <td className="p-3">{p.plan?.name || "—"}</td>
                <td className="p-3 capitalize">{p.cycle}</td>
                <td className="p-3">•••• {p.card_last4 || "----"}</td>
                <td className="p-3 font-medium">{money(Number(p.amount))}</td>
                <td className="p-3"><Badge variant={p.status === "succeeded" ? "default" : "destructive"}>{p.status}</Badge></td>
              </tr>
            ))}
            {payments.length===0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No payments yet</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}