import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Loader2, Sparkles, Search, Clock, ShoppingBag, UtensilsCrossed, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { placePublicOrder } from "@/lib/public-orders.functions";
import { noindexHead } from "@/lib/seo";

// Everything the page needs, resolved before the component ever mounts —
// same reasoning as /t/$tableId: TanStack Router won't render `component`
// until this settles, for both SSR and client-side navigation, so the
// route's own `pendingComponent` is the only loading UI in the lifecycle.
async function loadTakeawayData(tenantId: string): Promise<{ tenant: any; cats: any[]; items: any[] }> {
  const [{ data: t }, { data: c }, { data: i }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    supabase.from("menu_categories").select("*").eq("tenant_id", tenantId).order("sort_order"),
    supabase.from("menu_items").select("*").eq("tenant_id", tenantId).eq("is_available", true).order("sort_order"),
  ]);
  return { tenant: t ?? null, cats: c ?? [], items: i ?? [] };
}

// The ONE loading screen for this route. Deliberately generic/unbranded —
// it has no tenant data yet (the loader hasn't resolved), and must never
// change appearance once shown, so it never tries to guess a logo.
function TakeawayPending() {
  return null;
}

function TakeawayError() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Couldn't load the menu</h1>
        <p className="text-muted-foreground mt-2">Something went wrong. Please try again.</p>
        <Button className="mt-4 rounded-full h-11 px-6" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/takeaway/$tenantId")({
  head: noindexHead,
  loader: ({ params }) => loadTakeawayData(params.tenantId),
  pendingComponent: TakeawayPending,
  // No artificial delay in either direction: show the pending state the
  // instant loading takes any time at all, and don't hold it a minimum
  // duration once data is ready.
  pendingMs: 0,
  pendingMinMs: 0,
  errorComponent: TakeawayError,
  component: TakeawayOrder,
});

// Horizontal scrollers hide their native scrollbar — the arrows and track
// Chrome draws on a desktop viewport are the single most dated thing on the
// page. Swipe / trackpad scroll still works, and the snap points make the
// affordance obvious.
const RAIL = "flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// Card width for the Must try rail. Kept as one constant so the wrapper and
// the scroll step below can't drift apart.
const RAIL_CARD_W = 172;


// Contact-field rules, kept in one place so the typing guard, the inline
// messages and the submit check can't drift apart.
const PHONE_LEN = 10;
const sanitisePhone = (v: string) => v.replace(/\D/g, "").slice(0, PHONE_LEN);
const isPhoneValid = (v: string) => v.length === PHONE_LEN && /^\d+$/.test(v);
// Digits are stripped from the name as it's typed. Apostrophes, hyphens and
// full stops stay — plenty of real names need them (D'Souza, Jean-Luc, Dr.).
const sanitiseName = (v: string) => v.replace(/[0-9]/g, "");
const isNameValid = (v: string) => v.trim().length >= 2 && /^[^0-9]+$/.test(v);

// The asterisk is aria-hidden and paired with aria-required on the input:
// the visual marker is for sighted users, the attribute is what a screen
// reader announces, so the requirement isn't stated twice.
function RequiredMark() {
  return <span className="text-red-500" aria-hidden>*</span>;
}

function FieldError({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return <p className="text-[11px] text-red-500">{children}</p>;
}

function Thumb({ src, alt, className }: { src?: string | null; alt?: string; className?: string }) {
  if (src) return <img src={src} alt={alt ?? ""} className={`object-cover ${className}`} />;
  return (
    <div className={`bg-muted grid place-items-center text-muted-foreground/40 ${className}`}>
      <UtensilsCrossed className="h-6 w-6" />
    </div>
  );
}

function Stepper({ qty, onDec, onInc, className = "" }: { qty: number; onDec: () => void; onInc: () => void; className?: string }) {
  return (
    <div className={`flex items-center bg-primary text-primary-foreground rounded-full h-8 shadow-md shadow-primary/25 ${className}`}>
      <button aria-label="Remove one" onClick={onDec} className="h-8 w-8 grid place-items-center rounded-full">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center text-xs font-bold tabular-nums">{qty}</span>
      <button aria-label="Add one" onClick={onInc} className="h-8 w-8 grid place-items-center rounded-full">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// The tappable area (image + text) is its own button so the add control can
// sit beside it rather than nested inside it — a button inside a button is
// invalid markup and breaks keyboard and screen-reader navigation.
function ItemCard({ item, qty, onAdd, onDec, onOpen }: { item: any; qty: number; onAdd: () => void; onDec: () => void; onOpen: () => void }) {
  return (
    <div className="rounded-3xl bg-background p-2.5 shadow-md shadow-black/5 flex flex-col h-full">
      <button onClick={onOpen} className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <div className="relative">
          <Thumb src={item.image_url} alt={item.name} className="aspect-[4/3] w-full rounded-2xl" />
          {item.is_must_try && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background/90 backdrop-blur px-2 py-1 text-[10px] font-bold shadow-sm">
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />Must try
            </span>
          )}
        </div>
        <div className="px-1 pt-2.5">
          <h3 className="text-sm font-bold leading-snug line-clamp-1">{item.name}</h3>
          {item.description && (
            <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5">{item.description}</p>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between px-1 mt-auto pt-2.5 h-10">
        <span className="text-[15px] font-bold">{money(item.price)}</span>
        {qty
          ? <Stepper qty={qty} onDec={onDec} onInc={onAdd} />
          : (
            <button
              aria-label={`Add ${item.name}`}
              onClick={onAdd}
              className="h-8 w-8 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
      </div>
    </div>
  );
}

// Detail view. The photo is shown flat and still — no rotation, no motion of
// its own. The only movement on this screen is the sheet sliding in, which
// answers the tap that opened it.
function ItemDetail({ item, qty, onAdd, onDec, onClose }: { item: any; qty: number; onAdd: () => void; onDec: () => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Stop the menu behind the dialog from scrolling under it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div
        className="w-full max-w-md bg-background rounded-t-[32px] sm:rounded-[32px] max-h-[92vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Column layout capped at 92vh. The text and the price row keep their
            natural height (shrink-0); the photo is the only flexible piece, so
            on a short viewport it gives up height instead of the card growing
            past the screen and producing a scrollbar. */}
        <div className="relative p-5 flex flex-col h-full max-h-[92vh]">
          <button
            ref={closeRef}
            aria-label="Close"
            onClick={onClose}
            className="absolute top-5 right-5 z-10 h-9 w-9 grid place-items-center rounded-full bg-background/90 backdrop-blur shadow-md"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="aspect-square w-full min-h-0 overflow-hidden rounded-3xl bg-muted/60">
            <Thumb src={item.image_url} alt={item.name} className="h-full w-full" />
          </div>

          {item.is_must_try && (
            <span className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-600 px-3 py-1.5 text-[11px] font-bold mt-4">
              <Sparkles className="h-3.5 w-3.5" />Must try
            </span>
          )}

          <h2 className="shrink-0 text-2xl font-bold tracking-tight mt-3">{item.name}</h2>
          {item.description && (
            <p className="shrink-0 text-sm text-muted-foreground leading-relaxed mt-2 line-clamp-3">{item.description}</p>
          )}

          <div className="shrink-0 flex items-center justify-between gap-4 mt-6">
            <span className="text-2xl font-bold">{money(item.price)}</span>
            {qty
              ? <Stepper qty={qty} onDec={onDec} onInc={onAdd} className="h-12 scale-110 origin-right" />
              : (
                <Button onClick={onAdd} className="h-12 rounded-full px-7 font-semibold shadow-lg shadow-primary/25">
                  Add to order
                </Button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TakeawayOrder() {
  const { tenant, cats, items } = Route.useLoaderData();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState("");
  // No "All" pill any more, so the first category is the landing tab.
  const [activeCat, setActiveCat] = useState<string>(cats[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);
  useTenantBrand(tenant);

  const cartItems = items.filter((i: any) => cart[i.id]);
  const subtotal = cartItems.reduce((a: number, b: any) => a + Number(b.price) * cart[b.id], 0);
  // Tax % comes from the tenant's Settings → Tax rate, the same value the server applies.
  const taxPercent = Number((tenant?.settings as any)?.tax_rate ?? 0);
  const tax = Math.round(subtotal * (Number.isFinite(taxPercent) ? Math.min(Math.max(taxPercent, 0), 100) : 0)) / 100;
  const total = subtotal + tax;
  const count = cartItems.reduce((a: number, b: any) => a + cart[b.id], 0);
  const detailItem = detailId ? items.find((i: any) => i.id === detailId) : null;

  // Non-digits are stripped as the user types and the value is capped at ten,
  // so the field can never hold something that would fail at submit time.
  const onPhoneChange = (v: string) => setPhone(sanitisePhone(v));
  // Same idea for the name: digits never make it into state, so the field
  // can't hold a value the submit check would reject.
  const onNameChange = (v: string) => setName(sanitiseName(v));
  const nameValid = isNameValid(name);
  const phoneValid = isPhoneValid(phone);

  const add = (id: string) => setCart({ ...cart, [id]: (cart[id] ?? 0) + 1 });
  const dec = (id: string) => {
    const next = { ...cart };
    if ((next[id] ?? 0) <= 1) delete next[id]; else next[id] = next[id] - 1;
    setCart(next);
  };

  // Touch devices swipe the rail; a pointer device has nothing to grab once
  // the native scrollbar is hidden, so the arrows below are its affordance.
  const scrollRail = (dir: 1 | -1) => railRef.current?.scrollBy({ left: dir * (RAIL_CARD_W + 12), behavior: "smooth" });

  async function placeOrder() {
    if (!nameValid) return toast.error("Enter your name");
    if (phone && !phoneValid) return toast.error(`Enter a ${PHONE_LEN}-digit phone number`);
    if (cartItems.length === 0) return toast.error("Cart is empty");
    setPlacing(true);
    try {
      await placePublicOrder({ data: {
        tenant_id: tenant.id,
        customer_name: name.trim(),
        customer_phone: phone,
        order_type: "takeaway",
        items: cartItems.map((i: any) => ({ menu_item_id: i.id, quantity: cart[i.id] })),
      } });
      toast.success("Order placed!");
      // Stays in the placing state through the redirect — the loader is the
      // last thing on screen rather than the menu flashing back first.
      // Without a phone there is nothing to look the order up by, so the status page opens with no filter.
      window.location.href = phone ? `/status?phone=${encodeURIComponent(phone)}` : "/status";
    } catch (error) {
      setPlacing(false);
      toast.error(error instanceof Error ? error.message : "Failed to place order");
    }
  }

  if (!tenant) return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Restaurant not found</h1>
        <p className="text-muted-foreground mt-1">This link doesn't point to a menu we can open.</p>
      </div>
    </div>
  );

  const q = search.trim().toLowerCase();
  // While searching, look across the whole menu rather than only the open tab —
  // with no "All" pill there'd otherwise be no way to search everything.
  const visibleItems = items.filter((i: any) => i.is_available !== false && (q ? true : i.category_id === activeCat) && (!q || i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q)));
  const mustTry = items.filter((i: any) => i.is_available !== false && i.is_must_try);

  return (
    <div className="min-h-screen bg-background">
      {/* Phone-width column on a plain white page. The white is only visible
          in the gutters on a desktop viewport, which frames the menu at the
          size it was designed for; on a phone the column fills the screen. */}
      <div className="mx-auto w-full max-w-lg min-h-screen flex flex-col bg-slate-100 pb-32 shadow-xl shadow-black/5">
      {/* Hero is a contained card with air on all four sides — identity only.
          Search sits below it as its own element on the page background. */}
      <div className="px-4 pt-4">
        <header className="relative overflow-hidden rounded-[28px] bg-primary text-primary-foreground p-5 shadow-xl shadow-primary/20">
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-black/10 blur-3xl" />

          {/* Name, slogan and the meta pills are one column; the logo is its
              sibling, so `items-center` centres it against the card's full
              height instead of aligning it to the title row alone. */}
          <div className="relative flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl leading-tight font-bold tracking-tight truncate">{tenant?.name}</h1>
              {tenant?.slogan && <p className="text-[13px] opacity-75 mt-1 truncate">{tenant.slogan}</p>}

              <div className="flex flex-wrap gap-2 mt-4">
                {/* Takeaway's counterpart to the table pill on /t/$tableId —
                    same slot, so the two menus read as one product. */}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full pl-2.5 pr-3 py-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />Takeaway
                </span>
                {(tenant?.opening_time || tenant?.closing_time) && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full pl-2.5 pr-3 py-1.5">
                    <Clock className="h-3.5 w-3.5" />{tenant?.opening_time || ""}–{tenant?.closing_time || ""}
                  </span>
                )}
              </div>
            </div>

            {tenant?.logo_url
              ? <img src={tenant.logo_url} alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/30 shrink-0" />
              : <div className="h-20 w-20 rounded-2xl bg-white/20 grid place-items-center text-2xl font-bold shrink-0">{(tenant?.name || "R").slice(0, 1)}</div>}
          </div>
        </header>
      </div>

      <div className="px-4 mt-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search for dishes"
            className="h-12 pl-11 pr-4 rounded-2xl bg-background border-0 shadow-md shadow-black/5 focus-visible:ring-2 focus-visible:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6">
        {mustTry.length > 0 && !q && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="font-bold text-[15px] tracking-tight">Must try</h2>
              </div>
              {mustTry.length > 2 && (
                <div className="hidden sm:flex items-center gap-1.5">
                  <button aria-label="Scroll left" onClick={() => scrollRail(-1)} className="h-8 w-8 grid place-items-center rounded-full bg-background shadow-sm text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button aria-label="Scroll right" onClick={() => scrollRail(1)} className="h-8 w-8 grid place-items-center rounded-full bg-background shadow-sm text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div ref={railRef} className={`${RAIL} items-stretch -mx-4 px-4 pb-1`}>
              {mustTry.map((i: any) => (
                <div key={i.id} className="shrink-0 snap-start" style={{ width: RAIL_CARD_W }}>
                  <ItemCard item={i} qty={cart[i.id] ?? 0} onAdd={() => add(i.id)} onDec={() => dec(i.id)} onOpen={() => setDetailId(i.id)} />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={`${RAIL} -mx-4 px-4 pb-1`}>
          {cats.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 text-[13px] font-semibold px-4 py-2.5 rounded-full whitespace-nowrap transition-colors ${activeCat === c.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-background text-muted-foreground"}`}
            >{c.name}</button>
          ))}
        </div>

        {(q ? cats : cats.filter((c: any) => c.id === activeCat)).map((c: any) => {
          const list = visibleItems.filter((i: any) => i.category_id === c.id);
          if (list.length === 0) return null;
          return (
            <section key={c.id}>
              <h2 className="font-bold text-[15px] tracking-tight mb-3">{c.name}</h2>
              <div className="grid grid-cols-2 gap-3 items-stretch">
                {list.map((i: any) => (
                  <ItemCard key={i.id} item={i} qty={cart[i.id] ?? 0} onAdd={() => add(i.id)} onDec={() => dec(i.id)} onOpen={() => setDetailId(i.id)} />
                ))}
              </div>
            </section>
          );
        })}

        {visibleItems.length === 0 && (
          <div className="text-center py-16">
            <div className="h-14 w-14 rounded-2xl bg-muted grid place-items-center mx-auto text-muted-foreground/50">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium mt-3">Nothing matches that</p>
            <p className="text-xs text-muted-foreground mt-1">Try another dish name or pick a different category.</p>
          </div>
        )}
      </div>
      <p className="mt-auto pt-8 pb-6 text-center text-xs text-muted-foreground">Powered by DineEatz</p>
      </div>

      {detailItem && (
        <ItemDetail
          item={detailItem}
          qty={cart[detailItem.id] ?? 0}
          onAdd={() => add(detailItem.id)}
          onDec={() => dec(detailItem.id)}
          onClose={() => setDetailId(null)}
        />
      )}

      {/* Compact centred pill rather than a full-width bar: the count sits in
          a badge on the cart glyph, so the control only takes the width its
          own text needs and leaves the menu behind it visible. */}
      {cartItems.length > 0 && !showCart && !detailItem && (
        <div className="fixed bottom-5 inset-x-0 z-40 flex justify-center px-4">
          <button
            onClick={() => setShowCart(true)}
            aria-label={`View cart, ${count} ${count === 1 ? "item" : "items"}, ${money(total)}`}
            className="inline-flex items-center gap-2.5 h-12 pl-3 pr-5 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 text-sm font-semibold"
          >
            <span className="relative grid place-items-center h-9 w-9 rounded-full bg-white/20">
              <ShoppingCart className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-background text-primary text-[10px] font-bold grid place-items-center tabular-nums">{count}</span>
            </span>
            <span>View cart</span>
            <span className="opacity-50">·</span>
            <span className="tabular-nums">{money(total)}</span>
          </button>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6" onClick={() => !placing && setShowCart(false)}>
          {/* Fixed-size panel with one scroll area: the whole contents scroll
              together inside it, rather than the item list scrolling on its
              own. The native scrollbar is hidden, so the scroll is by wheel,
              trackpad or touch and nothing crosses the rounded corners. */}
          <div
            className="w-full max-w-md bg-background rounded-t-[32px] sm:rounded-[32px] max-h-[85vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1.5 w-10 rounded-full bg-muted mx-auto mb-5 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tracking-tight">Your takeaway order</h2>
              <button aria-label="Close" onClick={() => setShowCart(false)} className="h-9 w-9 grid place-items-center rounded-full bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {cartItems.map((i: any) => (
                <div key={i.id} className="flex items-center gap-3">
                  <Thumb src={i.image_url} alt="" className="h-12 w-12 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{money(i.price)} each</div>
                  </div>
                  <Stepper qty={cart[i.id]} onDec={() => dec(i.id)} onInc={() => add(i.id)} />
                  <div className="w-16 text-right text-sm font-bold">{money(Number(i.price) * cart[i.id])}</div>
                </div>
              ))}
            </div>

            {/* Subtotal and tax are the only things this sheet has that the
                dine-in one doesn't; the total keeps the same weight and rule
                above it so the two panels still end the same way. */}
            <div className="mt-5 pt-4 border-t space-y-2">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Tax</span><span className="tabular-nums">{money(tax)}</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold pt-2 border-t">
                <span>Total</span><span className="tabular-nums">{money(total)}</span>
              </div>
            </div>

            {/* `required` is omitted deliberately — these inputs are not inside
                a <form>, so it would never fire. aria-required is what a screen
                reader announces, and the checks in placeOrder are what actually
                gate submission. */}
            <div className="space-y-3 mt-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Name <RequiredMark />
                </Label>
                <Input
                  value={name}
                  onChange={e => onNameChange(e.target.value)}
                  autoComplete="name"
                  placeholder="Your full name"
                  aria-required="true"
                  aria-invalid={name.length > 0 && !nameValid}
                  className="h-12 rounded-2xl bg-muted/50 border-0"
                />
                <FieldError show={name.length > 0 && !nameValid}>Enter at least 2 letters, no numbers</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Phone <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  value={phone}
                  onChange={e => onPhoneChange(e.target.value)}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={PHONE_LEN}
                  placeholder={`${PHONE_LEN}-digit mobile number`}
                  aria-invalid={phone.length > 0 && !phoneValid}
                  className="h-12 rounded-2xl bg-muted/50 border-0"
                />
                <FieldError show={phone.length > 0 && !phoneValid}>Phone number must be {PHONE_LEN} digits</FieldError>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1 h-12 rounded-full font-semibold border-2" onClick={() => setShowCart(false)} disabled={placing}>Keep browsing</Button>
              <Button onClick={placeOrder} className="flex-1 h-12 rounded-full font-semibold shadow-lg shadow-primary/25" disabled={placing}>
                {placing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Placing…</> : "Place order"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
