import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Plus, Minus, ShoppingCart, Info } from "lucide-react";
import { clearRoundMarkers } from "@/lib/public-orders.functions";

// ---------------------------------------------------------------------------
// Schema assumptions — verify against src/integrations/supabase/types.ts and
// change here if they differ. Nothing else in this file needs editing.
// ---------------------------------------------------------------------------
const MENU_RELATION = "menu_items";          // relation holding the sellable items
const TABLES_RELATION = "restaurant_tables"; // same relation the orders board uses

// The payment_status enum on this database is (unpaid | paid | refunded).
// This must be one of those labels — Postgres rejects the insert outright
// otherwise, it does not coerce.
const UNPAID_STATUS = "unpaid";

const AVAILABILITY_COLUMN = "is_available";  // set to null to skip the filter

// GST rate applied to the subtotal. 0.10 = 10%, which is what the existing
// orders on this database use (58 tax on a 580 subtotal).
//
// This has to match whatever the QR checkout applies. If the rate is ever set
// per tenant or per menu item, this constant becomes wrong for some orders —
// move it to that source rather than editing the number here.
const TAX_RATE = 0.1;
// true if menu prices already include GST (tax is backed out of the subtotal
// rather than added on top). Must match what the QR checkout does.
const TAX_INCLUSIVE = false;

// Statuses an order can still take new items in. `as const` matters — the
// generated types narrow `status` to a literal union, and .in() rejects string[].
const OPEN_STATUSES = ["new", "preparing", "ready"] as const;

type OrderType = "dine_in" | "takeaway" | "home_delivery";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
};

type Line = { item: MenuItem; qty: number; amount: number };

const ORDER_TYPES: { key: OrderType; label: string }[] = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "home_delivery", label: "Home delivery" },
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// Shared shell for both dialogs. The sheet is capped to the visible viewport
// (dvh, so the mobile browser chrome doesn't push the footer off-screen), the
// header and footer are pinned, and everything between them scrolls.
const dialogShellClass =
  "w-[calc(100vw-1.5rem)] sm:w-full max-w-3xl p-0 gap-0 " +
  "max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden";
const dialogHeaderClass = "shrink-0 border-b px-4 sm:px-6 py-3 sm:py-4 pr-12 text-left";
const dialogBodyClass = "flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4";
const dialogFooterClass = "shrink-0 border-t bg-background px-4 sm:px-6 py-3 gap-2";

function priceOf(row: any): number {
  const raw = row.price ?? row.selling_price ?? row.amount ?? row.rate ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Shared data loading
// ---------------------------------------------------------------------------

function useMenu(open: boolean, tenantId?: string) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || menu.length) return;
    (async () => {
      setLoading(true);

      let q = (supabase as any).from(MENU_RELATION).select("*");
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (AVAILABILITY_COLUMN) q = q.eq(AVAILABILITY_COLUMN, true);
      const { data: menuRows, error: menuErr } = await q;

      if (menuErr) {
        toast.error(`Menu could not be loaded from "${MENU_RELATION}": ${menuErr.message}`);
      } else {
        setMenu(
          (menuRows || []).map((m: any) => ({
            id: m.id,
            name: String(m.name ?? m.title ?? m.item_name ?? "Item"),
            price: priceOf(m),
            category: m.category ?? m.category_name ?? null,
          })),
        );
      }

      // Reported rather than swallowed: an empty table list leaves dine-in
      // orders with no table_id, and the floor plan then cannot mark anything
      // busy — a failure that is invisible on this screen.
      let tq = (supabase as any).from(TABLES_RELATION).select("*");
      if (tenantId) tq = tq.eq("tenant_id", tenantId);
      const { data: tableRows, error: tableErr } = await tq;
      if (tableErr) {
        toast.error(`Tables could not be loaded from "${TABLES_RELATION}": ${tableErr.message}`);
      }
      setTables(
        (tableRows || [])
          .map((t: any) => {
            const label = t.label ?? t.name ?? t.table_number ?? t.number ?? t.code ?? t.title;
            return label === null || label === undefined || label === ""
              ? null
              : { id: t.id, label: /^table/i.test(String(label)) ? String(label) : `Table ${label}` };
          })
          .filter(Boolean) as { id: string; label: string }[],
      );

      setLoading(false);
    })();
  }, [open, menu.length, tenantId]);

  return { menu, tables, loading };
}

function useCart(menu: MenuItem[]) {
  const [cart, setCart] = useState<Record<string, number>>({});

  const lines: Line[] = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => {
          const item = menu.find(m => m.id === id)!;
          return { item, qty, amount: item.price * qty };
        })
        .filter(l => l.item),
    [cart, menu],
  );

  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);

  function bump(id: string, delta: number) {
    setCart(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  return { cart, lines, total, bump, clear: () => setCart({}) };
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

// The list scrolls inside itself only from md up, where it sits beside the form
// in a two-column layout. On a phone the dialog body is the single scroll
// container — a nested scroller there just traps the thumb. The search box
// sticks to the top of whichever container is doing the scrolling.
function MenuPicker({
  menu,
  loading,
  cart,
  bump,
}: {
  menu: MenuItem[];
  loading: boolean;
  cart: Record<string, number>;
  bump: (id: string, delta: number) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter(
      m => m.name.toLowerCase().includes(q) || (m.category ?? "").toLowerCase().includes(q),
    );
  }, [menu, search]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-2 pt-0.5 md:static md:mx-0 md:px-0 md:pb-0">
        <Input
          placeholder="Search menu…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="divide-y rounded-md border md:h-[46vh] md:overflow-y-auto">
        {loading ? (
          <div className="grid place-items-center py-10 text-muted-foreground md:h-full md:py-0">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No items found</p>
        ) : (
          filtered.map(m => {
            const qty = cart[m.id] || 0;
            return (
              <div key={m.id} className="flex items-center gap-2 p-2.5 md:p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{money(m.price)}</div>
                </div>
                {qty > 0 && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 md:h-7 md:w-7"
                      aria-label={`Remove one ${m.name}`}
                      onClick={() => bump(m.id, -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm tabular-nums">{qty}</span>
                  </>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant={qty > 0 ? "ghost" : "outline"}
                  className="h-8 w-8 shrink-0 md:h-7 md:w-7"
                  aria-label={`Add one ${m.name}`}
                  onClick={() => bump(m.id, 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CartSummary({ lines, total, heading }: { lines: Line[]; total: number; heading: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <ShoppingCart className="h-4 w-4" />
        {heading}
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items yet</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {lines.map(l => (
            <li key={l.item.id} className="flex justify-between gap-2">
              <span className="truncate">
                {l.qty}× {l.item.name}
              </span>
              <span className="shrink-0">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

// tenant_id is copied from the parent order, not derived separately: the RLS
// policy on order_items checks o.tenant_id = order_items.tenant_id, so rows
// inserted without it are rejected.
function itemRows(order: any, lines: Line[]) {
  return lines.map(l => ({
    order_id: order.id,
    tenant_id: order.tenant_id,
    menu_item_id: l.item.id,
    name: l.item.name,
    quantity: l.qty,
    price: l.item.price,
  })) as any;
}

// Order numbers are now generated per-tenant by the database trigger.
// The trigger calls get_next_order_number(p_tenant_id UUID) which safely handles
// concurrent order creation with advisory locking.

const round2 = (n: number) => Math.round(n * 100) / 100;

// The INSERT policy on orders requires tenant_id to be non-null and to name a
// real tenant, so the client has to supply it. This asks the database for the
// same function the policy itself uses rather than deriving the tenant
// separately — anything computed here by other means can disagree with the
// policy and fail the insert.
//
// Cached for the tab: it cannot change without a new sign-in. Cleared on
// failure so a transient error doesn't poison every later order.
let tenantIdPromise: Promise<string | null> | null = null;

function currentTenantId(): Promise<string | null> {
  if (tenantIdPromise) return tenantIdPromise;

  // Held in a local: the callback below reassigns the module variable, so
  // returning that variable instead would be `Promise | null` to the compiler.
  // `forget` also only clears the cache if this attempt is still the one in it,
  // so a slow failure can't evict a later successful lookup.
  const attempt: Promise<string | null> = (supabase as any)
    .rpc("current_tenant_id")
    .then(({ data, error }: any) => {
      const forget = () => {
        if (tenantIdPromise === attempt) tenantIdPromise = null;
        return null;
      };

      if (error) return forget();

      // The function is a SELECT … UNION SELECT …, so PostgREST returns a set.
      // One row is the normal case; more than one means this account reaches
      // several tenants and the order would be filed against an arbitrary one,
      // so refuse rather than guess.
      const rows = Array.isArray(data) ? data : data == null ? [] : [data];
      if (rows.length !== 1) return forget();

      const row = rows[0];
      const id = typeof row === "string" ? row : (row?.current_tenant_id ?? row?.id ?? null);
      return id ? String(id) : forget();
    });

  tenantIdPromise = attempt;
  return attempt;
}

// Recomputes subtotal / tax / total from the order's items and writes all three.
// Reading the items back instead of incrementing means the numbers can't drift
// when two people add to the same order at once, and it keeps the invoice
// columns on the status page consistent with each other.
async function recalcOrder(order: any): Promise<number | null> {
  const { data: rows, error } = await supabase
    .from("order_items")
    .select("price, quantity")
    .eq("order_id", order.id);

  if (error) {
    toast.error(`Totals could not be recalculated: ${error.message}`);
    return null;
  }

  const gross = (rows || []).reduce(
    (s: number, r: any) => s + Number(r.price ?? 0) * Number(r.quantity ?? 0),
    0,
  );
  const rate = TAX_RATE;
  const subtotal = TAX_INCLUSIVE ? gross / (1 + rate) : gross;
  const tax = TAX_INCLUSIVE ? gross - subtotal : gross * rate;
  const delivery = Number(order.delivery_fee ?? 0);
  const total = round2(subtotal + tax + delivery);

  const { error: updateError } = await supabase
    .from("orders")
    .update({ subtotal: round2(subtotal), tax: round2(tax), total })
    .eq("id", order.id);

  if (updateError) {
    toast.error(`Totals could not be saved: ${updateError.message}`);
    return null;
  }
  return total;
}

// Adds items to an order that already exists: inserts the rows, re-reads the
// order so nothing is computed from a stale card, recalculates the totals, and
// pulls the status back to "preparing" if the kitchen had already finished it.
async function appendToOrder(orderId: string, lines: Line[]): Promise<boolean> {
  const { data: fresh, error: readErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (readErr || !fresh) {
    toast.error(readErr?.message ?? "Order could not be read");
    return false;
  }

  // Anything that isn't still unpaid has been settled one way or the other
  // (paid, or paid and refunded) and has an invoice out against it. Adding to
  // it would leave that invoice understating what was served.
  const payment = (fresh as any).payment_status;
  if (payment !== UNPAID_STATUS) {
    toast.error(
      payment === "refunded"
        ? "This order has been refunded — create a new order instead"
        : "This order is already paid — create a new order instead",
    );
    return false;
  }

  const markNewRound = ["preparing", "ready", "served"].includes((fresh as any).status);
  const needsStatusChange = ["ready", "served"].includes((fresh as any).status);
  if (needsStatusChange) {
    await clearRoundMarkers({ data: { order_id: orderId } });
  }
  const rows = itemRows(fresh, lines);
  if (markNewRound) rows.forEach((r: any) => { r.notes = "__nr__"; });
  const { error: itemsError } = await supabase.from("order_items").insert(rows);
  if (itemsError) {
    toast.error(`Items could not be added: ${itemsError.message}`);
    return false;
  }

  const total = await recalcOrder(fresh);
  if (total === null) return false; // recalcOrder has already reported why

  let backToPreparing = false;
  if (needsStatusChange) {
    const { error: statusError } = await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", orderId);
    if (statusError) toast.warning(`Items added, but status not changed: ${statusError.message}`);
    else backToPreparing = true;
  }

  toast.success(
    backToPreparing
      ? `Items added to #${(fresh as any).order_number} — back to Preparing`
      : `Items added to #${(fresh as any).order_number}`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// New order
// ---------------------------------------------------------------------------

export function NewOrderDialog({ tenantId, onSaved }: { tenantId?: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { menu, tables, loading } = useMenu(open, tenantId);
  const { cart, lines, total, bump, clear } = useCart(menu);

  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");

  // An order already running on the chosen table, if any.
  const [openOrder, setOpenOrder] = useState<any>(null);
  const [appendMode, setAppendMode] = useState(true);

  function reset() {
    setOrderType("dine_in");
    setTableId("");
    setCustomerName("");
    setPhone("");
    setAddress("");
    setPincode("");
    setOpenOrder(null);
    setAppendMode(true);
    clear();
  }

  useEffect(() => {
    if (orderType !== "dine_in" || !tableId) {
      setOpenOrder(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("table_id", tableId)
        // Positive match on "unpaid" rather than "not paid" — a refunded order
        // sitting on the table is closed, not open, and must not be offered
        // here as something to add a round to.
        .eq("payment_status", UNPAID_STATUS)
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);
      setOpenOrder((data as any)?.[0] ?? null);
      setAppendMode(true);
    })();
  }, [orderType, tableId]);

  const appending = Boolean(openOrder) && appendMode;

  async function submit() {
    if (!lines.length) return toast.error("Add at least one item");
    // A dine-in order without a table_id is invisible on the floor plan, so
    // this refuses outright instead of letting an empty table list wave it
    // through — which is what "&& tables.length" used to do.
    if (orderType === "dine_in" && !tableId) {
      return toast.error(
        tables.length
          ? "Pick a table"
          : "No tables found — add one under Tables & QR, or place this as takeaway",
      );
    }
    if (orderType === "home_delivery" && !address.trim())
      return toast.error("Delivery address is required");

    setSaving(true);

    if (appending) {
      const ok = await appendToOrder(openOrder.id, lines);
      setSaving(false);
      if (!ok) return;
      reset();
      setOpen(false);
      onSaved();
      return;
    }

    // Resolved before the insert so a missing tenant fails here, cleanly,
    // rather than as an RLS rejection with no usable message.
    const tenantId = await currentTenantId();
    if (!tenantId) {
      setSaving(false);
      return toast.error(
        "Could not work out which restaurant this order belongs to — sign out and back in, then try again",
      );
    }

    const payload: any = {
      tenant_id: tenantId,
      customer_name: customerName.trim() || "Walk-in",
      customer_phone: phone.trim() || null,
      order_type: orderType,
      status: "new",
      payment_status: UNPAID_STATUS,
      total,
    };
    if (orderType === "dine_in" && tableId) payload.table_id = tableId;
    if (orderType === "home_delivery") {
      payload.delivery_address = address.trim();
      payload.delivery_pincode = pincode.trim() || null;
    }

    const { data: order, error } = await supabase.from("orders").insert(payload).select().single();

    if (error || !order) {
      setSaving(false);
      return toast.error(error?.message ?? "Order could not be created");
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemRows(order as any, lines));

    if (itemsError) {
      // Don't leave a headless order sitting on the board. Cancel rather than
      // delete — DELETE on orders is restricted to super admins.
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", (order as any).id);
      setSaving(false);
      return toast.error(`Items could not be saved: ${itemsError.message}`);
    }

    // The insert above carries a provisional total; this fills in subtotal and
    // tax and corrects the total, using the same path as an append.
    await recalcOrder(order as any);

    setSaving(false);
    toast.success(`Order #${(order as any).order_number} created`);
    reset();
    setOpen(false);
    onSaved();
  }

  // Rendered twice: inside the form column on desktop, and after the menu on a
  // phone, where the running cart belongs below the thing you're tapping.
  const summary = (
    <>
      <CartSummary lines={lines} total={total} heading={appending ? "Adding" : "Order"} />
      {appending && (
        <p className="mt-3 text-xs text-muted-foreground">
          Adding {money(total)} before tax — the order total is recalculated on save.
        </p>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New order
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogShellClass}>
        <DialogHeader className={dialogHeaderClass}>
          <DialogTitle className="truncate text-base sm:text-lg">
            {appending ? `Add to #${openOrder.order_number}` : "New order"}
          </DialogTitle>
        </DialogHeader>

        <div className={dialogBodyClass}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {ORDER_TYPES.map(t => (
                  <Button
                    key={t.key}
                    type="button"
                    size="sm"
                    variant={orderType === t.key ? "default" : "outline"}
                    className="min-w-[30%] flex-1 text-xs"
                    onClick={() => setOrderType(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {orderType === "dine_in" && (
                <select
                  className={selectClass}
                  value={tableId}
                  onChange={e => setTableId(e.target.value)}
                >
                  <option value="">Select table</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              {openOrder && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <div className="flex gap-2 text-xs">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      This table already has order #{openOrder.order_number} open
                      {openOrder.customer_name ? ` (${openOrder.customer_name})` : ""}.
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={appendMode ? "default" : "outline"}
                      className="flex-1 text-xs"
                      onClick={() => setAppendMode(true)}
                    >
                      Add to it
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={appendMode ? "outline" : "default"}
                      className="flex-1 text-xs"
                      onClick={() => setAppendMode(false)}
                    >
                      Separate order
                    </Button>
                  </div>
                </div>
              )}

              {!appending && (
                <>
                  <Input
                    placeholder="Customer name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Customer Phone Number"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                  {orderType === "home_delivery" && (
                    <>
                      <Input
                        placeholder="Delivery address"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="Pincode"
                        value={pincode}
                        onChange={e => setPincode(e.target.value)}
                      />
                    </>
                  )}
                </>
              )}

              <div className="hidden md:block">{summary}</div>
            </div>

            <MenuPicker menu={menu} loading={loading} cart={cart} bump={bump} />

            <div className="md:hidden">{summary}</div>
          </div>
        </div>

        <DialogFooter className={dialogFooterClass}>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !lines.length}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : appending ? (
              `Add items · ${money(total)}`
            ) : (
              `Create order · ${money(total)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add items to one existing order — rendered on each card
// ---------------------------------------------------------------------------

export function AddItemsDialog({ order, onSaved }: { order: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { menu, loading } = useMenu(open, order?.tenant_id);
  const { cart, lines, total, bump, clear } = useCart(menu);

  async function submit() {
    if (!lines.length) return toast.error("Add at least one item");
    setSaving(true);
    const ok = await appendToOrder(order.id, lines);
    setSaving(false);
    if (!ok) return;
    clear();
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) clear();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 w-full text-xs">
          Add items
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogShellClass}>
        <DialogHeader className={dialogHeaderClass}>
          <DialogTitle className="truncate text-base sm:text-lg">
            Add items to #{order.order_number} · {order.customer_name}
          </DialogTitle>
        </DialogHeader>

        <div className={dialogBodyClass}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="order-2 space-y-3 md:order-1">
              <CartSummary lines={lines} total={total} heading="Adding" />
              <p className="text-xs text-muted-foreground">
                Current total {money(Number(order.total ?? 0))}. Adding {money(total)} before tax —
                subtotal, tax and total are recalculated on save.
                {["ready", "served"].includes(order.status) &&
                  " This order will move back to Preparing."}
              </p>
            </div>

            <div className="order-1 md:order-2">
              <MenuPicker menu={menu} loading={loading} cart={cart} bump={bump} />
            </div>
          </div>
        </div>

        <DialogFooter className={dialogFooterClass}>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !lines.length}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add items · ${money(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}