import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { FEATURE_GROUPS, FEATURE_LABEL, ALL_FEATURE_KEYS, ALWAYS_ON_FEATURES } from "@/config/plan-features";


const empty = { name: "", description: "", monthly_price: 0, half_yearly_price: 0, yearly_price: 0, max_tables: 10, max_orders_month: 500, max_menu_items: 100, max_staff: 5, is_active: true, features: {} as Record<string, boolean> };


function Plans() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { const { data } = await supabase.from("subscription_plans").select("*").order("sort_order"); setRows(data || []); }
  useEffect(() => { load(); }, []);

  async function save() {
    const { id, ...rest } = editing;
    // Every feature key is saved as true or false, so a configured plan is never stored as {}.
    const body = { ...rest, features: Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, ALWAYS_ON_FEATURES.includes(k) || !!editing.features?.[k]])) };
    const res = id ? await supabase.from("subscription_plans").update(body).eq("id", id) : await supabase.from("subscription_plans").insert(body);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved"); setEditing(null); load();
  }
  async function del(id: string) {
    if (!confirm("Delete plan?")) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center"><Button onClick={()=>setEditing({...empty})}><Plus className="h-4 w-4 mr-1"/>New plan</Button></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(p => (
          <Card key={p.id} className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
              </div>
              <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setEditing(p)}><Pencil className="h-3 w-3"/></Button><Button size="sm" variant="ghost" onClick={()=>del(p.id)}><Trash2 className="h-3 w-3"/></Button></div>
            </div>
            <div className="text-2xl font-semibold">{money(p.monthly_price)}<span className="text-xs text-muted-foreground font-normal">/mo</span></div>
            <div className="text-xs text-muted-foreground">Half-yearly: {money(p.half_yearly_price)} · Yearly: {money(p.yearly_price)}</div>
            <ul className="text-xs space-y-0.5 pt-2 border-t">
              <li>Tables: {p.max_tables ?? "∞"}</li>
              <li>Orders/mo: {p.max_orders_month ?? "∞"}</li>
              <li>Menu items: {p.max_menu_items ?? "∞"}</li>
              <li>Staff: {p.max_staff ?? "∞"}</li>
            </ul>
            <div className="text-xs text-muted-foreground pt-2 border-t">
              {Object.keys(FEATURE_LABEL).filter((k) => p.features?.[k]).map((k) => FEATURE_LABEL[k]).join(" · ") || "No features enabled"}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${p.is_active ? "bg-success/15 text-success" : "bg-muted"}`}>{p.is_active ? "Active" : "Hidden"}</span>
          </Card>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={o=>!o&&setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></div>
              <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})}/></div>
              <div><Label>Monthly ₹</Label><Input type="number" value={editing.monthly_price} onChange={e=>setEditing({...editing,monthly_price:Number(e.target.value)})}/></div>
              <div><Label>Half-yearly ₹</Label><Input type="number" value={editing.half_yearly_price ?? 0} onChange={e=>setEditing({...editing,half_yearly_price:Number(e.target.value)})}/></div>
              <div><Label>Yearly ₹</Label><Input type="number" value={editing.yearly_price} onChange={e=>setEditing({...editing,yearly_price:Number(e.target.value)})}/></div>
              {/* Blank limit = Unlimited (saved as null) */}
              <div><Label>Max tables</Label><Input type="number" placeholder="Unlimited" value={editing.max_tables ?? ""} onChange={e=>setEditing({...editing,max_tables:e.target.value===""?null:Number(e.target.value)})}/></div>
              <div><Label>Max orders/mo</Label><Input type="number" placeholder="Unlimited" value={editing.max_orders_month ?? ""} onChange={e=>setEditing({...editing,max_orders_month:e.target.value===""?null:Number(e.target.value)})}/></div>
              <div><Label>Max menu items</Label><Input type="number" placeholder="Unlimited" value={editing.max_menu_items ?? ""} onChange={e=>setEditing({...editing,max_menu_items:e.target.value===""?null:Number(e.target.value)})}/></div>
              <div><Label>Max staff</Label><Input type="number" placeholder="Unlimited" value={editing.max_staff ?? ""} onChange={e=>setEditing({...editing,max_staff:e.target.value===""?null:Number(e.target.value)})}/></div>
              <div className="col-span-2 space-y-3 rounded-lg border p-3">
                <Label>Features</Label>
                {FEATURE_GROUPS.map((g) => (
                  <div key={g.title} className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">{g.title}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {g.items.map((f) => (
                        <div key={f.key} className="flex items-center gap-2">
                          <Switch
                            checked={ALWAYS_ON_FEATURES.includes(f.key) || !!editing.features?.[f.key]}
                            disabled={ALWAYS_ON_FEATURES.includes(f.key)}
                            onCheckedChange={v=>setEditing({...editing,features:{...(editing.features||{}),[f.key]:v}})}
                          />
                          <Label className="text-sm font-normal">{f.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={editing.is_active} onCheckedChange={v=>setEditing({...editing,is_active:v})}/><Label>Active</Label></div>
              <div className="col-span-2 flex justify-end"><Button onClick={save}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/plans")({ component: Plans });