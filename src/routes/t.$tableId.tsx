import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/t/$tableId")({ component: TableOrder });

function TableOrder() {
  const { tableId } = useParams({ from: "/t/$tableId" });
  const [table, setTable] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [gateStep, setGateStep] = useState<"check"|"blocked"|"ok"|"resume">("check");

  useEffect(() => { (async () => {
    const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
    if (!t) { setGateStep("blocked"); return; }
    setTable(t);
    const { data: ten } = await supabase.from("tenants").select("*").eq("id", t.tenant_id).single();
    setTenant(ten);
    const [{ data: c }, { data: i }] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
      supabase.from("menu_items").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
    ]);
    setCats(c || []); setItems(i || []);
    const { data: ao } = await supabase.from("orders").select("*").eq("table_id", t.id).not("status", "in", "(served,cancelled)").maybeSingle();
    if (ao) { setActiveOrder(ao); setGateStep("resume"); }
    else setGateStep("ok");
  })(); }, [tableId]);

  async function checkReturning() {
    if (!name || !phone) return toast.error("Name and phone required");
    // if there's an active order at this table with the same phone, resume
    if (activeOrder && activeOrder.customer_phone === phone) { return; }
    if (activeOrder) return toast.error("This table is already booked by another guest. Please wait.");
  }

  const cartItems = items.filter(i => cart[i.id]);
  const total = cartItems.reduce((a, b) => a + Number(b.price) * cart[b.id], 0);

  async function placeOrder() {
    if (!name.trim()) return toast.error("Name is required");
    if (!phone.trim()) return toast.error("Phone is required");
    if (cartItems.length === 0) return toast.error("Cart is empty");
    // upsert customer
    const { data: cust } = await supabase.from("customers").upsert({ tenant_id: tenant.id, name, phone }, { onConflict: "tenant_id,phone" }).select().single();
    const { data: order, error } = await supabase.from("orders").insert({
      tenant_id: tenant.id, table_id: table.id, customer_id: cust?.id,
      customer_name: name, customer_phone: phone,
      order_type: "dine_in", status: "new", payment_status: "unpaid",
      subtotal: total, tax: Math.round(total * 0.05), total: total + Math.round(total * 0.05),
    }).select().single();
    if (error || !order) return toast.error(error?.message || "Failed");
    await supabase.from("order_items").insert(cartItems.map(i => ({
      order_id: order.id, tenant_id: tenant.id, menu_item_id: i.id, name: i.name, price: i.price, quantity: cart[i.id],
    })));
    setActiveOrder(order);
    setGateStep("resume");
    setCart({}); setShowCart(false);
    toast.success("Order placed!");
  }

  if (gateStep === "check") return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (gateStep === "blocked") return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">Invalid QR</h1><p className="text-muted-foreground">This table code is not recognised.</p></div></div>;

  if (gateStep === "resume") {
    return (
      <div className="min-h-screen bg-background p-4 max-w-md mx-auto">
        <Card className="p-6 text-center space-y-3">
          <h1 className="text-xl font-semibold">Enter to view your order status</h1>
          <p className="text-sm text-muted-foreground">Table {table?.label} currently has an active order. Enter your name & phone to see status or (if it's yours) resume.</p>
          <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <Input placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} />
          <Button className="w-full" onClick={() => {
            if (activeOrder.customer_phone === phone) {
              // resume — show status
              window.location.href = `/status?phone=${encodeURIComponent(phone)}`;
            } else {
              toast.error("This table is already booked. Please wait until it's free.");
            }
          }}>Continue</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="p-4 border-b sticky top-0 bg-background z-10">
        <div className="font-semibold">{tenant?.name}</div>
        <div className="text-xs text-muted-foreground">Table {table?.label}</div>
      </header>
      <main className="p-4 space-y-6 max-w-md mx-auto">
        {cats.map(c => (
          <section key={c.id}>
            <h2 className="font-medium mb-2">{c.name}</h2>
            <div className="space-y-2">
              {items.filter(i => i.category_id === c.id).map(i => (
                <Card key={i.id} className="p-3 flex items-center justify-between">
                  <div><div className="font-medium text-sm">{i.name}</div><div className="text-xs text-muted-foreground">{money(i.price)}</div></div>
                  {cart[i.id] ? (
                    <div className="flex items-center gap-2">
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
      </main>
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-background border-t">
          <Button className="w-full" onClick={()=>setShowCart(true)}><ShoppingCart className="h-4 w-4 mr-2"/>View cart · {money(total)}</Button>
        </div>
      )}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-background/95 p-4 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-lg font-semibold">Your order</h2>
            <div className="divide-y">
              {cartItems.map(i => (
                <div key={i.id} className="py-2 flex justify-between text-sm">
                  <div>{cart[i.id]}× {i.name}</div><div>{money(Number(i.price)*cart[i.id])}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-medium">Total<span>{money(total)}</span></div>
            <div><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} required/></div>
            <div><Label>Phone *</Label><Input value={phone} onChange={e=>setPhone(e.target.value)} required/></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setShowCart(false)}>Keep browsing</Button>
              <Button onClick={placeOrder} className="flex-1">Place order</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}