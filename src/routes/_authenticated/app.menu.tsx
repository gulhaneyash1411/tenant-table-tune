import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/menu")({ component: Menu });

function Menu() {
  const [tenant, setTenant] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [newCat, setNewCat] = useState("");

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("*").eq("owner_id", u.user!.id).single();
    setTenant(t);
    const { data: c } = await supabase.from("menu_categories").select("*").order("sort_order");
    setCats(c || []);
    const { data: i } = await supabase.from("menu_items").select("*").order("sort_order");
    const byCat: Record<string, any[]> = {};
    (i || []).forEach((it: any) => { (byCat[it.category_id] ||= []).push(it); });
    setItems(byCat);
  }
  useEffect(() => { load(); }, []);

  async function addCat() {
    if (!newCat.trim() || !tenant) return;
    const { error } = await supabase.from("menu_categories").insert({ name: newCat, tenant_id: tenant.id, sort_order: cats.length });
    if (error) return toast.error(error.message);
    setNewCat(""); load();
  }
  async function addItem(catId: string, name: string, price: number) {
    if (!tenant || !name) return;
    const { error } = await supabase.from("menu_items").insert({ tenant_id: tenant.id, category_id: catId, name, price });
    if (error) return toast.error(error.message);
    load();
  }
  async function delItem(id: string) { await supabase.from("menu_items").delete().eq("id", id); load(); }
  async function delCat(id: string) { await supabase.from("menu_categories").delete().eq("id", id); load(); }
  async function updateItem(id: string, patch: any) {
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Menu</h1>
      <Card className="p-4 flex gap-2 items-end">
        <div className="flex-1"><Label>New category</Label><Input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="e.g. Desserts"/></div>
        <Button onClick={addCat}><Plus className="h-4 w-4 mr-1"/>Add category</Button>
      </Card>
      {cats.map(c => (
        <Card key={c.id} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-lg">{c.name}</div>
            <Button size="sm" variant="ghost" onClick={()=>delCat(c.id)}><Trash2 className="h-4 w-4"/></Button>
          </div>
          <div className="divide-y">
            {(items[c.id] || []).map(i => (
              <ItemRow key={i.id} item={i} onDelete={()=>delItem(i.id)} onUpdate={(p)=>updateItem(i.id,p)} />
            ))}
          </div>
          <AddItem onAdd={(n,p)=>addItem(c.id,n,p)} />
        </Card>
      ))}
    </div>
  );
}

function ItemRow({ item, onDelete, onUpdate }: { item: any; onDelete: ()=>void; onUpdate: (p:any)=>void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: item.name, description: item.description || "", price: item.price, image_url: item.image_url || "" });
  return (
    <div className="py-3 space-y-2">
      <div className="flex items-center gap-3">
        {item.image_url ? <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded object-cover"/> : <div className="h-12 w-12 rounded bg-muted"/>}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{item.name}</div>
          {item.description && <div className="text-xs text-muted-foreground truncate">{item.description}</div>}
        </div>
        <span className="text-sm">{money(item.price)}</span>
        <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">Must try</span>
          <Switch checked={!!item.is_must_try} onCheckedChange={(v)=>onUpdate({ is_must_try: v })} />
        </div>
        <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">Available</span>
          <Switch checked={!!item.is_available} onCheckedChange={(v)=>onUpdate({ is_available: v })} />
        </div>
        <Button size="sm" variant="ghost" onClick={()=>setOpen(!open)}><Pencil className="h-3 w-3"/></Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3"/></Button>
      </div>
      {open && (
        <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
          <div><Label className="text-xs">Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
          <div><Label className="text-xs">Price</Label><Input type="number" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
          <div className="md:col-span-2"><Label className="text-xs">Image URL</Label><Input value={f.image_url} placeholder="https://…" onChange={e=>setF({...f,image_url:e.target.value})}/></div>
          <div className="md:col-span-2"><Label className="text-xs">Description</Label><Textarea rows={2} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={()=>{ onUpdate(f); setOpen(false); }}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddItem({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(0);
  return (
    <div className="flex gap-2">
      <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Item name" />
      <Input value={price} onChange={e=>setPrice(Number(e.target.value))} type="number" className="w-32" placeholder="Price"/>
      <Button onClick={()=>{ onAdd(name, price); setName(""); setPrice(0); }}><Plus className="h-4 w-4"/></Button>
    </div>
  );
}