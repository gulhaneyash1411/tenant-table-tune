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
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { FEATURE_GROUPS, FEATURE_LABEL, ALL_FEATURE_KEYS, ALWAYS_ON_FEATURES } from "@/config/plan-features";
import { PLAN_ICON_OPTIONS, PlanIconGlyph } from "@/config/plan-icons";


const empty = { name: "", description: "", monthly_price: 0, half_yearly_price: 0, yearly_price: 0, max_tables: 10, max_orders_month: 500, max_menu_items: 100, max_staff: 5, is_active: true, features: {} as Record<string, boolean>, tag: null as string | null, icon: null as string | null, included_features: [] as string[], not_included_features: [] as string[] };

// Quick-add tags shown under the tag box.
const SUGGESTED_TAGS = ["Entry Plan", "Recommended", "Full Access", "Most Popular", "Best Value"];

// Trim each line and drop blanks before saving.
const cleanList = (list?: string[] | null) => (list ?? []).map((s) => s.trim()).filter(Boolean);

// A list of free-text lines: type one, press Enter or Add, remove with ×.
function FeatureListField({ label, placeholder, items, onChange }: { label: string; placeholder: string; items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!items.includes(v)) onChange([...items, v]);
    setDraft("");
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1 text-sm">
              <span className="truncate">{item}</span>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function Plans() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  // The free-text tag box. Chips set the tag without writing into this box.
  const [customTag, setCustomTag] = useState("");
  // When a plan is opened, show its tag in the box only if it is a custom one.
  useEffect(() => {
    if (!editing) return;
    setCustomTag(editing.tag && !SUGGESTED_TAGS.includes(editing.tag) ? editing.tag : "");
  }, [editing?.id ?? (editing ? "new" : null)]);

  async function load() { const { data } = await supabase.from("subscription_plans").select("*").order("sort_order"); setRows(data || []); }
  useEffect(() => { load(); }, []);

  async function save() {
    const { id, ...rest0 } = editing;
    const rest = { ...rest0, tag: editing.tag?.trim() || null, included_features: cleanList(editing.included_features), not_included_features: cleanList(editing.not_included_features) };
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
        {/* Cheapest monthly price first */}
        {[...rows].sort((a, b) => Number(a.monthly_price) - Number(b.monthly_price)).map(p => (
          <Card key={p.id} className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 font-semibold"><PlanIconGlyph name={p.icon} className="h-4 w-4 text-primary" />{p.name}</div>
                {p.tag && (
                  <div className="mt-1">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{p.tag}</span>
                  </div>
                )}
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
              <div className="col-span-2 space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_ICON_OPTIONS.map(({ key, label, Icon }) => {
                    const on = editing.icon === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={()=>setEditing({...editing, icon: on ? null : key})}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Tag</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.map((t) => {
                    const on = editing.tag === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={()=>{ setCustomTag(""); setEditing({...editing, tag: on ? null : t}); }}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <Input
                  placeholder="Or type your own tag"
                  value={customTag}
                  onChange={e=>{ setCustomTag(e.target.value); setEditing({...editing, tag: e.target.value}); }}
                />
              </div>
              <div><Label>Monthly ₹</Label><Input type="number" value={editing.monthly_price || ""} placeholder="0" onChange={e=>setEditing({...editing,monthly_price:e.target.value===""?0:Number(e.target.value)})}/></div>
              <div><Label>Half-yearly ₹</Label><Input type="number" value={editing.half_yearly_price || ""} placeholder="0" onChange={e=>setEditing({...editing,half_yearly_price:e.target.value===""?0:Number(e.target.value)})}/></div>
              <div><Label>Yearly ₹</Label><Input type="number" value={editing.yearly_price || ""} placeholder="0" onChange={e=>setEditing({...editing,yearly_price:e.target.value===""?0:Number(e.target.value)})}/></div>
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
              {/* Shown as written on the owner's subscription card */}
              <div className="col-span-2 space-y-3 rounded-lg border p-3">
                <FeatureListField
                  label="Included features"
                  placeholder="e.g. Unlimited KOT printing"
                  items={editing.included_features ?? []}
                  onChange={(v) => setEditing({ ...editing, included_features: v })}
                />
                <FeatureListField
                  label="Not included features"
                  placeholder="e.g. Multi-outlet management"
                  items={editing.not_included_features ?? []}
                  onChange={(v) => setEditing({ ...editing, not_included_features: v })}
                />
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