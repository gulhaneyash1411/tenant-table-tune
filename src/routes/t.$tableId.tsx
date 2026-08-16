import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Loader2, Sparkles, Search, Clock, MapPin } from "lucide-react";
import { BrandedLoader } from "@/components/branded-loader";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { getActiveTableOrder, placePublicOrder } from "@/lib/public-orders.functions";

// Everything the page needs, resolved before the component ever mounts.
// TanStack Router won't render `component` until this promise settles — for
// both the initial SSR request and any later client-side navigation — so
// there is exactly one place in the whole lifecycle that can show a loading
// UI: the route's own `pendingComponent` below. The component itself never
// renders a "loading" state of its own, because by the time it renders it
// always already has real data.
async function loadTableData(tableId: string) {
  const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
  if (!t) return { table: null as any, tenant: null as any, cats: [] as any[], items: [] as any[], activeOrder: null as any };
  // Everything below only depends on t.tenant_id/t.id, so fetch it all in
  // parallel instead of a chain of sequential round trips.
  const [{ data: ten }, { data: c }, { data: i }, ao] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", t.tenant_id).single(),
    supabase.from("menu_categories").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
    supabase.from("menu_items").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
    // An active-order lookup failure shouldn't block the whole page — treat
    // it as "no active order" rather than failing the entire loader.
    getActiveTableOrder({ data: { table_id: t.id } }).catch(() => null),
  ]);
  return { table: t, tenant: ten ?? null, cats: c ?? [], items: i ?? [], activeOrder: ao ?? null };
}

// The ONE loading screen for this route. Deliberately generic/unbranded —
// it has no tenant data yet (the loader hasn't resolved), and must never
// change appearance once shown, so it never tries to guess a logo.
function TablePending() {
  return <BrandedLoader label="Loading Menu..." />;
}

function TableError() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Couldn't load the menu</h1>
        <p className="text-muted-foreground mt-2">Something went wrong. Please try again.</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/t/$tableId")({
  loader: ({ params }) => loadTableData(params.tableId),
  pendingComponent: TablePending,
  // No artificial delay in either direction: show the pending state the
  // instant loading takes any time at all, and don't hold it a minimum
  // duration once data is ready.
  pendingMs: 0,
  pendingMinMs: 0,
  errorComponent: TableError,
  component: TableOrder,
});

function TableOrder() {
  const loaderData = Route.useLoaderData();
  const { table, tenant, cats, items } = loaderData;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(loaderData.activeOrder);
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  useTenantBrand(tenant);

  const cartItems = items.filter((i: any) => cart[i.id]);
  const total = cartItems.reduce((a: number, b: any) => a + Number(b.price) * cart[b.id], 0);

  async function placeOrder() {
    if (!name.trim()) return toast.error("Name is required");
    if (!phone.trim()) return toast.error("Phone is required");
    if (cartItems.length === 0) return toast.error("Cart is empty");
    setPlacing(true);
    try {
      const order = await placePublicOrder({ data: {
        tenant_id: tenant.id,
        table_id: table.id,
        customer_name: name,
        customer_phone: phone,
        order_type: "dine_in",
        items: cartItems.map((i: any) => ({ menu_item_id: i.id, quantity: cart[i.id] })),
      } });
      setActiveOrder(order);
      setCart({}); setShowCart(false);
      toast.success("Order placed!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  if (placing) return <BrandedLoader tenant={tenant} label="Placing your order…" />;
  if (!table) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">Invalid QR</h1><p className="text-muted-foreground">This table code is not recognised.</p></div></div>;

  if (activeOrder) {
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

  const q = search.trim().toLowerCase();
  const visibleItems = items.filter((i: any) => i.is_available !== false && (activeCat === "all" || i.category_id === activeCat) && (!q || i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q)));
  const mustTry = items.filter((i: any) => i.is_available !== false && i.is_must_try);

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <div className="relative overflow-hidden">
        <div className="h-32 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/40" />
        <div className="max-w-md mx-auto px-4 -mt-14 relative">
          <Card className="p-4 flex gap-3 items-center shadow-lg">
            {tenant?.logo_url ? <img src={tenant.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover"/> : <div className="h-16 w-16 rounded-xl bg-primary/10 text-primary grid place-items-center text-xl font-semibold">{(tenant?.name||"R").slice(0,1)}</div>}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{tenant?.name}</div>
              {tenant?.slogan && <div className="text-xs text-muted-foreground italic truncate">"{tenant.slogan}"</div>}
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3"/>Table {table?.label}</span>
                {(tenant?.opening_time || tenant?.closing_time) && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3"/>{tenant?.opening_time || ""}–{tenant?.closing_time || ""}</span>}
              </div>
            </div>
          </Card>
        </div>
      </div>
      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input placeholder="Search for dishes" className="pl-9 bg-background" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        {mustTry.length > 0 && !q && activeCat === "all" && (
          <section>
            <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-amber-500"/><h2 className="font-semibold text-sm">Must try</h2></div>
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x">
              {mustTry.map(i => (
                <Card key={i.id} className="min-w-[160px] snap-start overflow-hidden">
                  {i.image_url ? <img src={i.image_url} alt={i.name} className="h-24 w-full object-cover"/> : <div className="h-24 w-full bg-muted"/>}
                  <div className="p-2">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs">{money(i.price)}</span>
                      {cart[i.id] ? (
                        <div className="flex items-center gap-1 border rounded-full px-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>setCart({...cart,[i.id]:Math.max(0,cart[i.id]-1)})}><Minus className="h-3 w-3"/></Button>
                          <span className="w-4 text-center text-xs font-semibold text-primary">{cart[i.id]}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>setCart({...cart,[i.id]:cart[i.id]+1})}><Plus className="h-3 w-3"/></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={()=>setCart({...cart,[i.id]:1})}>Add</Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          <button onClick={()=>setActiveCat("all")} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border ${activeCat==="all"?"bg-primary text-primary-foreground border-primary":"bg-background"}`}>All</button>
          {cats.map(c => <button key={c.id} onClick={()=>setActiveCat(c.id)} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border ${activeCat===c.id?"bg-primary text-primary-foreground border-primary":"bg-background"}`}>{c.name}</button>)}
        </div>
        {(activeCat === "all" ? cats : cats.filter(c => c.id === activeCat)).map(c => {
          const list = visibleItems.filter(i => i.category_id === c.id);
          if (list.length === 0) return null;
          return (
            <section key={c.id}>
              <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">{c.name}</h2>
              <div className="space-y-2">
                {list.map(i => (
                  <Card key={i.id} className="p-3 flex gap-3 items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="font-medium text-sm truncate">{i.name}</div>
                        {i.is_must_try && <Sparkles className="h-3 w-3 text-amber-500 shrink-0"/>}
                      </div>
                      {i.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{i.description}</div>}
                      <div className="text-sm font-semibold mt-1">{money(i.price)}</div>
                    </div>
                    <div className="relative">
                      {i.image_url ? <img src={i.image_url} alt="" className="h-20 w-20 rounded-lg object-cover"/> : <div className="h-20 w-20 rounded-lg bg-muted"/>}
                      {cart[i.id] ? (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border rounded-full shadow px-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>setCart({...cart,[i.id]:Math.max(0,cart[i.id]-1)})}><Minus className="h-3 w-3"/></Button>
                          <span className="w-4 text-center text-xs font-semibold text-primary">{cart[i.id]}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>setCart({...cart,[i.id]:cart[i.id]+1})}><Plus className="h-3 w-3"/></Button>
                        </div>
                      ) : (
                        <button onClick={()=>setCart({...cart,[i.id]:1})} className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-background text-primary border border-primary/40 rounded-full px-3 py-0.5 text-xs font-semibold shadow">ADD</button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
        {visibleItems.length === 0 && <div className="text-center text-muted-foreground py-12 text-sm">No dishes found.</div>}
      </div>
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-background/95 backdrop-blur border-t">
          <div className="max-w-md mx-auto"><Button className="w-full h-12" onClick={()=>setShowCart(true)}><ShoppingCart className="h-4 w-4 mr-2"/>{cartItems.reduce((a,b)=>a+cart[b.id],0)} item · View cart · {money(total)}</Button></div>
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
              <Button variant="outline" onClick={()=>setShowCart(false)} disabled={placing}>Keep browsing</Button>
              <Button onClick={placeOrder} className="flex-1" disabled={placing}>{placing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Placing…</> : "Place order"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
