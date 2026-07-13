import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Loader2 } from "lucide-react";

export const Route = createFileRoute("/takeaway/$tenantId")({ component: TakeawayOrder });

function TakeawayOrder() {
  const { tenantId } = useParams({ from: "/takeaway/$tenantId" });
  const [tenant, setTenant] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  useEffect(() => { (async () => {
    setLoading(true);
    const { data: t } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    setTenant(t);
    if (t) {
      const [{ data: c }, { data: i }] = await Promise.all([
        supabase.from("menu_categories").select("*").eq("tenant_id", tenantId).order("sort_order"),
        supabase.from("menu_items").select("*").eq("tenant_id", tenantId).eq("is_available", true).order("sort_order"),
      ]);
      setCats(c || []); setItems(i || []);
    }
    setLoading(false);
  })(); }, [tenantId]);

  const cartItems = items.filter(i => cart[i.id]);
  const subtotal = cartItems.reduce((a, b) => a + Number(b.price) * cart[b.id], 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  async function placeOrder() {
    if (!name.trim()) return toast.error("Name is required");
    if (!phone.trim()) return toast.error("Phone is required");
    if (cartItems.length === 0) return toast.error("Cart is empty");
    setPlacing(true);
    const { data: cust } = await supabase.from("customers").upsert({ tenant_id: tenant.id, name, phone }, { onConflict: "tenant_id,phone" }).select().single();
    const { data: order, error } = await supabase.from("orders").insert({
      tenant_id: tenant.id, customer_id: cust?.id,
      customer_name: name, customer_phone: phone,
      order_type: "takeaway", status: "new", payment_status: "unpaid",
      subtotal, tax, total,
    }).select().single();
    setPlacing(false);
    if (error || !order) return toast.error(error?.message || "Failed to place order");
    await supabase.from("order_items").insert(cartItems.map(i => ({
      order_id: order.id, tenant_id: tenant.id, menu_item_id: i.id, name: i.name, price: i.price, quantity: cart[i.id],
    })));
    toast.success("Order placed!");
    window.location.href = `/status?phone=${encodeURIComponent(phone)}`;
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  if (!tenant) return <div className="min-h-screen grid place-items-center text-muted-foreground">Restaurant not found</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="p-4 border-b sticky top-0 bg-background z-10">
        {tenant.logo_url && <img src={tenant.logo_url} alt="" className="h-10 w-10 rounded object-cover inline-block mr-2 align-middle"/>}
        <span className="font-semibold align-middle">{tenant.name}</span>
        <div className="text-xs text-muted-foreground">Takeaway · {tenant.slogan || tenant.city}</div>
      </header>
      <main className="p-4 space-y-6 max-w-md mx-auto">
        {cats.map(c => (
          <section key={c.id}>
            <h2 className="font-medium mb-2">{c.name}</h2>
            <div className="space-y-2">
              {items.filter(i => i.category_id === c.id).map(i => (
                <Card key={i.id} className="p-3 flex gap-3 items-center">
                  {i.image_url && <img src={i.image_url} alt="" className="h-14 w-14 rounded object-cover"/>}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{i.name}</div>
                    {i.description && <div className="text-xs text-muted-foreground line-clamp-1">{i.description}</div>}
                    <div className="text-xs mt-0.5">{money(i.price)}</div>
                  </div>
                  {cart[i.id] ? (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={()=>setCart({...cart,[i.id]:Math.max(0,cart[i.id]-1)})}><Minus className="h-3 w-3"/></Button>
                      <span className="w-6 text-center text-sm font-medium">{cart[i.id]}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={()=>setCart({...cart,[i.id]:cart[i.id]+1})}><Plus className="h-3 w-3"/></Button>
                    </div>
                  ) : <Button size="sm" onClick={()=>setCart({...cart,[i.id]:1})}>Add</Button>}
                </Card>
              ))}
            </div>
          </section>
        ))}
        {items.length === 0 && <div className="text-center text-muted-foreground py-12 text-sm">Menu is currently empty.</div>}
      </main>
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-background border-t">
          <div className="max-w-md mx-auto"><Button className="w-full" onClick={()=>setShowCart(true)}><ShoppingCart className="h-4 w-4 mr-2"/>View cart · {money(total)}</Button></div>
        </div>
      )}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-background/95 p-4 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-lg font-semibold">Your takeaway order</h2>
            <div className="divide-y">
              {cartItems.map(i => (
                <div key={i.id} className="py-2 flex justify-between text-sm">
                  <div>{cart[i.id]}× {i.name}</div><div>{money(Number(i.price)*cart[i.id])}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(tax)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{money(total)}</span></div>
            </div>
            <div><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} required/></div>
            <div><Label>Phone *</Label><Input value={phone} onChange={e=>setPhone(e.target.value)} required/></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setShowCart(false)} disabled={placing}>Keep browsing</Button>
              <Button onClick={placeOrder} className="flex-1" disabled={placing}>{placing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Placing…</> : "Place order"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
