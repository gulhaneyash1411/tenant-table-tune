import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";
import { Minus, Plus, ShoppingCart, Loader2, Sparkles, Search, Clock, MapPin, UtensilsCrossed, X, ChevronLeft, ChevronRight, CalendarClock, Ban, ScanLine } from "lucide-react";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { appendPublicOrderItems, validateSessionToken, getActiveSession, getActiveTableOrder, placePublicOrder, verifyTableOrderAccess } from "@/lib/public-orders.functions";
import { noindexHead } from "@/lib/seo";

/**
 * Whether a table is being held for a booking right now.
 *
 * This lives here rather than in public-orders.functions because it needs no
 * privileged client: table_reservation_hold is a security definer function in
 * the database, so it reads the reservation rows itself and hands back nothing
 * but timing. No guest name, phone, party size or notes ever reaches this page,
 * and table_reservations itself stays unreadable to the anonymous role.
 *
 * The 60-minute lead lives in the SQL function. It must match HOLD_LEAD_MINUTES
 * on the floor plan, or a guest and the host see different answers about the
 * same table.
 */
async function loadReservationHold(tableId: string) {
  const { data, error } = await supabase
    .rpc("table_reservation_hold", { p_table_id: tableId })
    .maybeSingle();

  // A lookup failure must not lock guests out of a table that may well be
  // free — fail open and let the order through.
  if (error || !data) return null;
  return data as { reserved_for: string; held_until: string };
}

// Everything the page needs, resolved before the component ever mounts.
// TanStack Router won't render `component` until this promise settles — for
// both the initial SSR request and any later client-side navigation — so
// there is exactly one place in the whole lifecycle that can show a loading
// UI: the route's own `pendingComponent` below. The component itself never
// renders a "loading" state of its own, because by the time it renders it
// always already has real data.
async function loadTableData(qrKey: string, sessionTokenParam?: string, hasResumeParams = false) {
  // `qrKey` is the secure QR token (/order/{token}) or, for QRs printed before
  // tokens existed, the table id. resolve_table_qr only answers while the QR is
  // active, the table is active and the outlet's subscription is live.
  const { data: resolved } = await (supabase as any).rpc("resolve_table_qr", { p_key: qrKey }).maybeSingle();
  const tableId: string | null = resolved?.table_id ?? null;
  const { data: t } = tableId
    ? await supabase.from("restaurant_tables").select("*").eq("id", tableId).single()
    : { data: null };
  if (!t) {
    return {
      table: null as any, tenant: null as any, cats: [] as any[], items: [] as any[],
      activeOrder: null as any, hold: null as any, session: null as any,
    };
  }
  // Everything below only depends on t.tenant_id/t.id, so fetch it all in
  // parallel instead of a chain of sequential round trips.
  const [{ data: ten }, { data: c }, { data: i }, ao, hold] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", t.tenant_id).single(),
    supabase.from("menu_categories").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
    supabase.from("menu_items").select("*").eq("tenant_id", t.tenant_id).order("sort_order"),
    // An active-order lookup failure shouldn't block the whole page — treat
    // it as "no active order" rather than failing the entire loader.
    getActiveTableOrder({ data: { table_id: t.id } }).catch(() => null),
    // Returns a row only while a booking is actually holding the table, so
    // its mere presence is the answer.
    loadReservationHold(t.id).catch(() => null),
  ]);
  // Session management: the URL carries a unique session token (?s=…) created
  // on QR scan. Only that token grants menu access. For the "Keep ordering"
  // flow (coming back from the status page), fall back to the table's active
  // session so the customer doesn't need to re-scan.
  let session: { session_id: string; session_token: string; expires_at: string } | null = null;
  try {
    if (sessionTokenParam) {
      session = await validateSessionToken({ data: { session_token: sessionTokenParam } });
    } else if (hasResumeParams) {
      session = await getActiveSession({ data: { table_id: t.id } });
    }
  } catch {
    session = null;
  }

  return {
    table: t, tenant: ten ?? null, cats: c ?? [], items: i ?? [],
    activeOrder: ao ?? null, hold: hold ?? null,
    session,
  };
}

// The ONE loading screen for this route. Deliberately generic/unbranded —
// it has no tenant data yet (the loader hasn't resolved), and must never
// change appearance once shown, so it never tries to guess a logo.
function TablePending() {
  return null;
}

function TableError() {
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

export const Route = createFileRoute("/t/$tableId")({
  head: noindexHead,
  loader: ({ params, location }) => {
    const search = location.search as any;
    return loadTableData(params.tableId, search?.s, !!(search?.order && search?.phone));
  },
  // A guest coming back from their status screen to order another round
  // carries the order they're adding to and the phone it was placed with.
  // Both are checked against the order actually open on this table below —
  // they reopen the menu, they don't grant anything on their own.
  // TanStack Router's default parser runs JSON.parse on raw query values, so
  // a ten-digit phone number arrives as a *number*, not a string.  Coerce both
  // params to string so the comparison in the component works regardless of
  // whether the URL was built with TanStack's navigate (JSON-quoted) or a raw
  // window.location.href assignment.
  validateSearch: (search: Record<string, unknown>): { order?: string; phone?: string; s?: string } => ({
    order: search.order != null ? String(search.order) : undefined,
    phone: search.phone != null ? String(search.phone) : undefined,
    s: search.s != null ? String(search.s) : undefined,
  }),
  pendingComponent: TablePending,
  // No artificial delay in either direction: show the pending state the
  // instant loading takes any time at all, and don't hold it a minimum
  // duration once data is ready.
  pendingMs: 0,
  pendingMinMs: 0,
  errorComponent: TableError,
  component: TableOrder,
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

function VegBadge({ isVeg }: { isVeg: boolean }) {
  return (
    <span className={`inline-block h-4 w-4 rounded-[3px] border-2 shrink-0 ${isVeg ? "border-green-600" : "border-red-600"}`}
      title={isVeg ? "Veg" : "Non-veg"}>
      <span className={`block h-full w-full rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} style={{ transform: "scale(0.45)" }} />
    </span>
  );
}

// Shown when the table can't take an order right now. Uses the same phone-width
// column, page tint and 32px card as the menu and cart, so a blocked scan reads
// as the same place rather than an error page from somewhere else. The copy
// tells the guest what to do next — staff are the resolution here, not a retry.
function TableNotice({
  tenant,
  table,
  icon,
  title,
  body,
}: { tenant: any; table: any; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg min-h-screen bg-slate-100 grid place-items-center p-4 shadow-xl shadow-black/5">
        <div className="w-full max-w-md rounded-[32px] bg-background p-6 shadow-xl shadow-black/5 text-center">
          {tenant?.logo_url
            ? <img src={tenant.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover mx-auto" />
            : <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary grid place-items-center text-xl font-bold mx-auto">{(tenant?.name || "R").slice(0, 1)}</div>}

          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mx-auto mt-5 text-muted-foreground">
            {icon}
          </div>

          <h1 className="text-xl font-bold tracking-tight mt-4">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">{body}</p>

          <div className="w-full rounded-2xl bg-primary/5 border border-primary/15 p-4 mt-5 flex items-center gap-3 text-left">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center text-primary">
              <ScanLine className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">
              Scan the QR code at your table to start a new session
            </p>
          </div>

          {table?.label && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted rounded-full pl-2.5 pr-3 py-1.5 mt-5">
              <MapPin className="h-3.5 w-3.5" />{table.label}
            </span>
          )}
        </div>
      </div>
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
          <div className="flex items-center gap-1.5">
            <VegBadge isVeg={item.is_veg !== false} />
            <h3 className="text-sm font-bold leading-snug line-clamp-1">{item.name}</h3>
          </div>
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

          <div className="shrink-0 flex flex-wrap items-center gap-2 mt-4">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${item.is_veg !== false ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>
              <VegBadge isVeg={item.is_veg !== false} />
              {item.is_veg !== false ? "Veg" : "Non-veg"}
            </span>
            {item.is_must_try && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-600 px-3 py-1.5 text-[11px] font-bold">
                <Sparkles className="h-3.5 w-3.5" />Must try
              </span>
            )}
          </div>

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

function TableOrder() {
  const loaderData = Route.useLoaderData();
  const { table, tenant, cats, items, hold } = loaderData;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [activeOrder, setActiveOrder] = useState<any>(loaderData.activeOrder);
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState("");
  const [dietFilter, setDietFilter] = useState<"all" | "veg" | "nonveg">("all");
  // No "All" pill any more, so the first category is the landing tab.
  const [activeCat, setActiveCat] = useState<string>(cats[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);
  const resumeParams = Route.useSearch();
  useTenantBrand(tenant);

  // Ordering session: gates order placement to prevent stale-link abuse.
  const [sessionToken, setSessionToken] = useState<string | null>(loaderData.session?.session_token ?? null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(() => {
    if (!loaderData.session) return true;
    return new Date(loaderData.session.expires_at).getTime() <= Date.now();
  });

  useEffect(() => {
    if (!loaderData.session) { setSessionExpired(true); return; }
    const expiresAt = new Date(loaderData.session.expires_at).getTime();
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { setSessionExpired(true); setSessionToken(null); return; }
    setSessionExpired(false);
    setSessionToken(loaderData.session.session_token);
    const timer = setTimeout(() => { setSessionExpired(true); setSessionToken(null); }, remaining);
    return () => clearTimeout(timer);
  }, [loaderData.session]);

  // "Keep ordering" on the status screen sends the guest back here with the
  // order id and the phone it was placed with. When both match the order that
  // is actually open on this table, this is the party already sitting here —
  // so the menu opens instead of the occupied-table screen, and the cart adds
  // to that running order rather than starting a second bill. The phone is the
  // same proof the occupied-table form asks for, carried rather than re-typed;
  // anyone arriving without it still meets that form.
  const resumeOrder = activeOrder
    && !!resumeParams.order && resumeParams.order === activeOrder.id
    && !!resumeParams.phone && resumeParams.phone === activeOrder.customer_phone
    ? activeOrder
    : null;

  const cartItems = items.filter((i: any) => cart[i.id]);
  const total = cartItems.reduce((a: number, b: any) => a + Number(b.price) * cart[b.id], 0);
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
    if (cartItems.length === 0) return toast.error("Cart is empty");
    // Only a first order asks who this is; a round added to an order already
    // carries the name and number it was placed with.
    if (!resumeOrder) {
      if (!nameValid) return toast.error("Enter your name");
      if (phone && !phoneValid) return toast.error(`Enter a ${PHONE_LEN}-digit phone number`);
    }
    setPlacing(true);
    // Without this the spinner would drop and the menu flash back up while the
    // browser is already on its way to the status screen.
    let leaving = false;
    try {
      if (resumeOrder) {
        await appendPublicOrderItems({ data: {
          order_id: resumeOrder.id,
          customer_phone: resumeOrder.customer_phone,
          session_token: sessionToken,
          items: cartItems.map((i: any) => ({ menu_item_id: i.id, quantity: cart[i.id] })),
        } });
        setCart({}); setShowCart(false);
        toast.success("Added to your order!");
        leaving = true;
        // Back to the status screen they came from, which now shows the new
        // round on the same running bill.
        window.location.href = resumeOrder.customer_phone ? `/status?phone=${encodeURIComponent(resumeOrder.customer_phone)}` : "/status";
        return;
      }
      const order = await placePublicOrder({ data: {
        tenant_id: tenant.id,
        table_id: table.id,
        customer_name: name.trim(),
        customer_phone: phone,
        order_type: "dine_in",
        session_token: sessionToken,
        items: cartItems.map((i: any) => ({ menu_item_id: i.id, quantity: cart[i.id] })),
      } });
      setActiveOrder(order);
      setCart({}); setShowCart(false);
      toast.success("Order placed!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to place order");
    } finally {
      if (!leaving) setPlacing(false);
    }
  }

  if (!table) return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Invalid QR</h1>
        <p className="text-muted-foreground mt-1">This table code is not recognised.</p>
      </div>
    </div>
  );

  // ---- Can this table take an order right now? ------------------------------
  // Three gates, in order of how final they are. Each one stops the menu from
  // rendering at all, so there is no path where a guest builds a cart and only
  // finds out at submit time that the table was never available.

  // 1. Retired or out of service. The QR may still be stuck to the table, so
  //    this has to say something better than "invalid code".
  if (table.is_active === false) {
    return (
      <TableNotice
        tenant={tenant}
        table={table}
        icon={<Ban className="h-5 w-5" />}
        title="This table isn't in service"
        body="Please ask a member of staff to seat you at another table, or scan the code there."
      />
    );
  }

  // 2. Held for a booking. The database function only returns a row while the
  //    hold is live, so its presence is the whole test — and it carries a time,
  //    never who the booking is for. Resolution here is a person, not a retry,
  //    but the button is there in case staff free it while this screen is open.
  if (hold && !activeOrder) {
    return (
      <TableNotice
        tenant={tenant}
        table={table}
        icon={<CalendarClock className="h-5 w-5" />}
        title="This table is reserved"
        body={
          hold.reserved_for
            ? `It's being held for a booking at ${format(new Date(hold.reserved_for), "p")}. Please speak to a member of staff and they'll seat you.`
            : "It's being held for a booking. Please speak to a member of staff and they'll seat you."
        }
      />
    );
  }

  // 3. Session expired — the link was reused from browser history / home.
  //    This blocks both fresh orders and resume-ordering ("Keep ordering" from
  //    the status page). A customer still at the table will have a live session;
  //    a customer at home with a saved link will not.
  if (sessionExpired) {
    return (
      <TableNotice
        tenant={tenant}
        table={table}
        icon={<Clock className="h-5 w-5" />}
        title="Session ended"
        body="Your ordering session has ended."
      />
    );
  }

  // 4. Busy — an order on this table is still unpaid. The party who placed it
  //    should be able to follow it, so this screen asks for their details
  //    rather than refusing outright. Anyone else gets turned away below.
  if (activeOrder && !resumeOrder) {
    return (
      // Same phone-width column and page tint as the menu, so this screen is
      // framed identically on a desktop viewport instead of reading as a
      // different app. The card itself uses the cart sheet's geometry —
      // max-w-md, 32px corners, p-5 — so all three panels match.
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-lg min-h-screen bg-slate-100 grid place-items-center p-4 shadow-xl shadow-black/5">
          <div className="w-full max-w-md rounded-[32px] bg-background p-6 shadow-xl shadow-black/5 text-center">
            {tenant?.logo_url
              ? <img src={tenant.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover mx-auto" />
              : <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary grid place-items-center text-xl font-bold mx-auto">{(tenant?.name || "R").slice(0, 1)}</div>}

            <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center mx-auto mt-5 text-primary">
              <UtensilsCrossed className="h-5 w-5" />
            </div>

            <h1 className="text-xl font-bold tracking-tight mt-4">View your order status</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              {table?.label} has an order in progress. Enter your details to follow it.
            </p>

            <div className="space-y-3 mt-5 text-left">
              <Input
                placeholder="Name"
                className="h-12 rounded-2xl bg-muted/50 border-0"
                value={name}
                onChange={e => onNameChange(e.target.value)}
                autoComplete="name"
                aria-label="Name"
              />
              <Input
                placeholder="Phone"
                className="h-12 rounded-2xl bg-muted/50 border-0"
                value={phone}
                onChange={e => onPhoneChange(e.target.value)}
                type="tel"
                inputMode="numeric"
                maxLength={PHONE_LEN}
                autoComplete="tel"
                aria-label="Phone"
              />
            </div>

            {table?.label && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted rounded-full pl-2.5 pr-3 py-1.5 mt-4">
                <MapPin className="h-3.5 w-3.5" />{table.label}
              </span>
            )}

            <Button className="w-full h-12 rounded-full font-semibold shadow-lg shadow-primary/25 mt-5" onClick={async () => {
              if (!nameValid) return toast.error("Enter your name");
              if (phone && !phoneValid) return toast.error(`Enter a ${PHONE_LEN}-digit phone number`);
              const access = await verifyTableOrderAccess({ data: { table_id: table.id, name: name.trim(), phone } });
              if (!access.ok) {
                return toast.error(phone
                  ? "Name and phone don't match the order on this table."
                  : "Name doesn't match the order on this table.");
              }
              window.location.href = phone
                ? `/status?phone=${encodeURIComponent(phone)}`
                : `/status?order=${access.order_id}`;
            }}>Continue</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Free: the menu ------------------------------------------------------

  const q = search.trim().toLowerCase();
  const dietOk = (i: any) => dietFilter === "all" || (dietFilter === "veg" ? i.is_veg !== false : i.is_veg === false);
  // While searching, look across the whole menu rather than only the open tab —
  // with no "All" pill there'd otherwise be no way to search everything.
  const visibleItems = items.filter((i: any) => i.is_available !== false && dietOk(i) && (q ? true : i.category_id === activeCat) && (!q || i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q)));
  const mustTry = items.filter((i: any) => i.is_available !== false && i.is_must_try && dietOk(i));

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
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full pl-2.5 pr-3 py-1.5">
                  <MapPin className="h-3.5 w-3.5" />{table?.label}
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

      {resumeOrder && (
        <div className="px-4 mt-4">
          <div className="flex items-center gap-2.5 rounded-2xl bg-primary/10 text-primary px-4 py-3 text-xs font-semibold">
            <Plus className="h-4 w-4 shrink-0" />
            <span className="min-w-0">Adding to order #{resumeOrder.order_number} — it all goes on one bill.</span>
          </div>
        </div>
      )}

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

      <div className="flex items-center gap-2 px-4 mt-4">
        {(["all", "veg", "nonveg"] as const).map(f => (
          <button key={f} onClick={() => setDietFilter(f)}
            className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors ${dietFilter === f ? (f === "veg" ? "bg-green-600 text-white shadow-md shadow-green-600/25" : f === "nonveg" ? "bg-red-600 text-white shadow-md shadow-red-600/25" : "bg-primary text-primary-foreground shadow-md shadow-primary/25") : "bg-background text-muted-foreground"}`}>
            {f === "veg" && <span className="inline-block h-3.5 w-3.5 rounded-[2px] border-2 border-current"><span className="block h-full w-full rounded-full bg-current" style={{ transform: "scale(0.45)" }} /></span>}
            {f === "nonveg" && <span className="inline-block h-3.5 w-3.5 rounded-[2px] border-2 border-current"><span className="block h-full w-full rounded-full bg-current" style={{ transform: "scale(0.45)" }} /></span>}
            {f === "all" ? "All" : f === "veg" ? "Veg" : "Non-veg"}
          </button>
        ))}
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
              <h2 className="text-xl font-bold tracking-tight">{resumeOrder ? "Add to your order" : "Your order"}</h2>
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

            <div className="flex justify-between items-center mt-5 pt-4 border-t text-base font-bold">
              <span>Total</span><span>{money(total)}</span>
            </div>

            {/* A guest adding a round was identified when they placed the
                order they came back to, so the contact fields are asked for on
                a first order only.

                `required` is omitted deliberately — these inputs are not inside
                a <form>, so it would never fire. aria-required is what a screen
                reader announces, and the checks in placeOrder are what actually
                gate submission. */}
            {resumeOrder ? (
              <p className="text-sm text-muted-foreground mt-5">
                These go on order #{resumeOrder.order_number}, under the name and number you ordered with.
              </p>
            ) : (
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
            )}

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1 h-12 rounded-full font-semibold border-2" onClick={() => setShowCart(false)} disabled={placing}>Keep browsing</Button>
              <Button onClick={placeOrder} className="flex-1 h-12 rounded-full font-semibold shadow-lg shadow-primary/25" disabled={placing}>
                {placing
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{resumeOrder ? "Adding…" : "Placing…"}</>
                  : resumeOrder ? "Add to order" : "Place order"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}