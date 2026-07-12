import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
              <div key={i.id} className="py-2 flex items-center justify-between text-sm">
                <div>{i.name}</div>
                <div className="flex items-center gap-3"><span>{money(i.price)}</span><Button size="sm" variant="ghost" onClick={()=>delItem(i.id)}><Trash2 className="h-3 w-3"/></Button></div>
              </div>
            ))}
          </div>
          <AddItem onAdd={(n,p)=>addItem(c.id,n,p)} />
        </Card>
      ))}
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