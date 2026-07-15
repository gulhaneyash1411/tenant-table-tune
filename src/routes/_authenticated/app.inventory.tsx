import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { Package, Plus, Trash2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/inventory")({ component: InventoryPage });

function InventoryPage() {
  const [tenantId, setTenantId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: "", sku: "", unit: "kg", stock_qty: 0, low_stock_at: 5, cost_price: 0 });

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("id").eq("owner_id", u.user!.id).maybeSingle();
    if (!t) return;
    setTenantId(t.id);
    const { data } = await (supabase as any).from("inventory_items").select("*").order("name");
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!f.name.trim()) return toast.error("Name required");
    const { error } = await (supabase as any).from("inventory_items").insert({ ...f, tenant_id: tenantId, stock_qty: Number(f.stock_qty)||0, low_stock_at: Number(f.low_stock_at)||0, cost_price: Number(f.cost_price)||0 });
    if (error) return toast.error(error.message);
    toast.success("Item added"); setOpen(false);
    setF({ name: "", sku: "", unit: "kg", stock_qty: 0, low_stock_at: 5, cost_price: 0 });
    load();
  }
  async function updateStock(id: string, qty: number) {
    const { error } = await (supabase as any).from("inventory_items").update({ stock_qty: qty }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }
  async function remove(id: string) {
    await (supabase as any).from("inventory_items").delete().eq("id", id);
    load();
  }

  const lowStock = rows.filter(r => Number(r.stock_qty) <= Number(r.low_stock_at || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Package className="h-6 w-6"/><h1 className="text-2xl font-semibold">Stock / Inventory</h1></div>
        <Button onClick={()=>setOpen(true)}><Plus className="h-4 w-4 mr-1"/>Add item</Button>
      </div>
      {lowStock.length > 0 && (
        <Card className="p-3 border-warning/50 bg-warning/5 flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-warning"/>{lowStock.length} item(s) at or below low-stock threshold</Card>
      )}
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">Item</th><th className="p-3">SKU</th><th className="p-3">Unit</th><th className="p-3">Stock</th><th className="p-3">Low at</th><th className="p-3">Cost</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-t ${Number(r.stock_qty) <= Number(r.low_stock_at||0) ? "bg-warning/5" : ""}`}>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3">{r.sku || "—"}</td>
                <td className="p-3">{r.unit}</td>
                <td className="p-3"><Input type="number" defaultValue={r.stock_qty} onBlur={e=>{ const v = Number(e.target.value); if (v !== Number(r.stock_qty)) updateStock(r.id, v); }} className="h-8 w-24"/></td>
                <td className="p-3">{r.low_stock_at}</td>
                <td className="p-3">{money(Number(r.cost_price||0))}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" className="text-destructive" onClick={()=>remove(r.id)}><Trash2 className="h-3 w-3"/></Button></td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No stock items yet</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add stock item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SKU</Label><Input value={f.sku} onChange={e=>setF({...f,sku:e.target.value})} /></div>
              <div><Label>Unit</Label><Input value={f.unit} onChange={e=>setF({...f,unit:e.target.value})} placeholder="kg, ltr, pcs" /></div>
              <div><Label>Stock qty</Label><Input type="number" value={f.stock_qty} onChange={e=>setF({...f,stock_qty:e.target.value})} /></div>
              <div><Label>Low-stock threshold</Label><Input type="number" value={f.low_stock_at} onChange={e=>setF({...f,low_stock_at:e.target.value})} /></div>
              <div><Label>Cost price</Label><Input type="number" value={f.cost_price} onChange={e=>setF({...f,cost_price:e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={add}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}