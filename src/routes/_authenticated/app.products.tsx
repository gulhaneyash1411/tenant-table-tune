import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle, CheckCircle2, Loader2, Minus, Package, Plus, QrCode, RefreshCw,
  Search, ShoppingBag, ShoppingCart, Smartphone, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { UPI_ID, UPI_PAYEE_NAME, UTR_PATTERN, buildUpiUrl } from "@/lib/payment-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/products")({ component: StorefrontPage });

const db = supabase as any;

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

type Variant = { name: string; value: string; price?: number | null; stock?: number | null };

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  discount_price: number | null;
  stock: number;
  sku: string;
  image_url: string | null;
  variants: Variant[];
  created_at: string;
};

type PaymentStatus = "pending" | "pending_approval" | "paid" | "rejected" | "failed" | "refunded";
type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

type MyOrder = {
  id: string;
  order_number: string;
  product_name: string;
  product_image_url: string | null;
  variant: string | null;
  quantity: number;
  unit_price: number | null;
  total_amount: number;
  payment_method: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  utr: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  delivery_address: string;
  notes: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  product_name: string;
  product_image_url: string | null;
  variant: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

// One line in the cart. Stock is kept for the stepper limit; the server checks it again.
type CartLine = {
  product_id: string;
  name: string;
  image_url: string | null;
  variant: string | null;
  unit_price: number;
  quantity: number;
  stock: number;
};

const CART_KEY = "plateos.product-cart";
const lineKey = (l: { product_id: string; variant: string | null }) => `${l.product_id}|${l.variant ?? ""}`;

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const unitPrice = (p: Product) => Number(p.discount_price ?? p.price);

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
};

const orderTone: Record<OrderStatus, Tone> = {
  pending: "warning", confirmed: "info", processing: "info",
  shipped: "info", delivered: "success", cancelled: "danger",
};

const ORDER_TRAIL: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered"];

const PAYMENT_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Payment pending", tone: "warning" },
  pending_approval: { label: "Payment under review", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Payment rejected", tone: "danger" },
  failed: { label: "Payment failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", toneCls[tone])}>
      {children}
    </span>
  );
}

function StateMessage({ icon: Icon, title, body, action }: {
  icon: typeof Package; title: string; body: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function QuantityStepper({ value, min = 1, max, onChange, label, disabled }: {
  value: number; min?: number; max: number; onChange: (n: number) => void; label: string; disabled?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="h-8 w-8"
        onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= min} aria-label={`Decrease ${label}`}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-8 text-center text-sm tabular-nums" aria-label={`${label}: ${value}`}>{value}</span>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8"
        onClick={() => onChange(clamp(value + 1))} disabled={disabled || value >= max} aria-label={`Increase ${label}`}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ }
  }, [lines]);

  const add = useCallback((line: CartLine) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => lineKey(l) === lineKey(line));
      if (i === -1) return [...ls, line];
      const next = [...ls];
      next[i] = { ...next[i], quantity: Math.min(next[i].quantity + line.quantity, line.stock) };
      return next;
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((ls) => ls.map((l) => (lineKey(l) === key ? { ...l, quantity } : l)));
  }, []);

  const remove = useCallback((key: string) => {
    setLines((ls) => ls.filter((l) => lineKey(l) !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);

  return { lines, add, setQuantity, remove, clear, count, subtotal };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function StorefrontPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const cart = useCart();
  const [tab, setTab] = useState("shop");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState<CartLine[] | null>(null);
  const [checkoutFromCart, setCheckoutFromCart] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(null);
    const { data, error } = await db
      .from("products").select("*").eq("status", "active").order("created_at", { ascending: false });
    if (error) setProductError(error.message);
    else setProducts((data ?? []) as Product[]);
    setLoadingProducts(false);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrderError(null);
    const { data, error } = await db
      .from("product_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) setOrderError(error.message);
    else setOrders((data ?? []) as MyOrder[]);
    setLoadingOrders(false);
  }, [user.id]);

  useEffect(() => { loadProducts(); loadOrders(); }, [loadProducts, loadOrders]);

  const awaitingPayment = orders.filter(
    (o) => o.order_status !== "cancelled" && o.payment_method !== "cod" &&
      (o.payment_status === "pending" || o.payment_status === "rejected"),
  ).length;

  const startCheckout = (lines: CartLine[], fromCart: boolean) => {
    setCartOpen(false);
    setCheckoutFromCart(fromCart);
    setCheckout(lines);
  };

  // How many of each product are already in the cart, for the card badges.
  const cartCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of cart.lines) map[l.product_id] = (map[l.product_id] ?? 0) + l.quantity;
    return map;
  }, [cart.lines]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Shop</h2>
          <p className="text-sm text-muted-foreground">Order supplies and equipment, pay by UPI, and track delivery.</p>
        </div>
        <Button variant="outline" onClick={() => setCartOpen(true)} className="gap-2">
          <ShoppingCart className="h-4 w-4" aria-hidden />
          Cart
          {cart.count > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {cart.count}
            </span>
          )}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="shop" className="gap-2"><Package className="h-4 w-4" aria-hidden />Browse</TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingBag className="h-4 w-4" aria-hidden />My orders
            {awaitingPayment > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {awaitingPayment}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shop" className="mt-6">
          <BrowseTab
            products={products} loading={loadingProducts} error={productError} reload={loadProducts}
            cartCounts={cartCounts}
            onAddToCart={cart.add}
            onBuyNow={(line) => startCheckout([line], false)}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <MyOrdersTab
            orders={orders} loading={loadingOrders} error={orderError}
            reload={loadOrders} onShop={() => setTab("shop")}
          />
        </TabsContent>
      </Tabs>

      <CartDialog
        open={cartOpen} onOpenChange={setCartOpen} cart={cart}
        onCheckout={() => startCheckout(cart.lines, true)}
      />

      <CheckoutDialog
        lines={checkout}
        user={user}
        onOpenChange={(o) => !o && setCheckout(null)}
        onPlaced={() => { if (checkoutFromCart) cart.clear(); loadProducts(); loadOrders(); }}
        onFinished={() => { setCheckout(null); loadOrders(); setTab("orders"); }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Browse                                                              */
/* ------------------------------------------------------------------ */

function BrowseTab({ products, loading, error, reload, cartCounts, onAddToCart, onBuyNow }: {
  products: Product[]; loading: boolean; error: string | null; reload: () => void;
  cartCounts: Record<string, number>;
  onAddToCart: (line: CartLine) => void;
  onBuyNow: (line: CartLine) => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [picking, setPicking] = useState<{ product: Product; intent: "cart" | "buy"; quantity: number } | null>(null);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = products.filter((p) =>
      (!s || p.name.toLowerCase().includes(s) || (p.description ?? "").toLowerCase().includes(s)) &&
      (category === "all" || p.category === category),
    );
    if (sort === "price-asc") return [...list].sort((a, b) => unitPrice(a) - unitPrice(b));
    if (sort === "price-desc") return [...list].sort((a, b) => unitPrice(b) - unitPrice(a));
    return list;
  }, [products, q, category, sort]);

  const hasFilters = q !== "" || category !== "all";

  const toLine = (p: Product, variant: string | null, quantity: number): CartLine => ({
    product_id: p.id, name: p.name, image_url: p.image_url, variant,
    unit_price: unitPrice(p), quantity, stock: p.stock,
  });

  // Products with variants need a choice first; the rest go straight in.
  const handle = (p: Product, intent: "cart" | "buy", quantity: number) => {
    if (p.variants?.length) { setPicking({ product: p, intent, quantity }); return; }
    const line = toLine(p, null, quantity);
    if (intent === "cart") { onAddToCart(line); toast.success(`${quantity} × ${p.name} added to cart`); }
    else onBuyNow(line);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:max-w-xs">
          <Label htmlFor="shop-search" className="sr-only">Search products</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="shop-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search products" className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="shop-category" aria-label="Filter by category" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger id="shop-sort" aria-label="Sort products" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="price-asc">Price, low to high</SelectItem>
            <SelectItem value="price-desc">Price, high to low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Card><StateMessage
          icon={AlertCircle} title="Products didn't load" body={error}
          action={<Button variant="outline" onClick={reload} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>}
        /></Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="space-y-3 p-4">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent></Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card><StateMessage icon={Package} title="Nothing on sale yet" body="New products will show up here as soon as they're listed." /></Card>
      ) : visible.length === 0 ? (
        <Card><StateMessage
          icon={Search} title="No matching products" body="Try a different search or category."
          action={hasFilters && <Button variant="outline" onClick={() => { setQ(""); setCategory("all"); }}>Clear filters</Button>}
        /></Card>
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} inCart={cartCounts[p.id] ?? 0}
              onAdd={(qty) => handle(p, "cart", qty)} onBuy={(qty) => handle(p, "buy", qty)} />
          ))}
        </ul>
      )}

      <VariantPickerDialog
        picking={picking}
        onOpenChange={(o) => !o && setPicking(null)}
        onConfirm={(product, variant, quantity, intent) => {
          const line = toLine(product, variant, quantity);
          setPicking(null);
          if (intent === "cart") { onAddToCart(line); toast.success(`${quantity} × ${product.name} added to cart`); }
          else onBuyNow(line);
        }}
      />
    </div>
  );
}

function ProductCard({ product, inCart, onAdd, onBuy }: {
  product: Product; inCart: number; onAdd: (quantity: number) => void; onBuy: (quantity: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const out = product.stock <= 0;
  const max = Math.max(1, Math.min(product.stock, 99));
  const off = product.discount_price != null
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : 0;

  const add = () => { onAdd(qty); setQty(1); };

  return (
    <li>
      <Card className="flex h-full flex-col overflow-hidden">
        {/* Fixed height, not aspect-ratio: as a flex child the box would otherwise
            stretch to a tall photo's intrinsic height and break the grid. */}
        <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} loading="lazy"
              className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Package className="h-8 w-8 text-muted-foreground" aria-hidden />
            </div>
          )}
          {off > 0 && !out && (
            <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
              {off}% off
            </span>
          )}
          {inCart > 0 && (
            <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              {inCart} in cart
            </span>
          )}
          {out && (
            <div className="absolute inset-0 grid place-items-center bg-background/70">
              <Pill tone="danger">Out of stock</Pill>
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col p-4">
          {/* Fixed heights on each block so every card lines up, whatever the content. */}
          <p className="truncate text-xs text-muted-foreground">{product.category}</p>

          <h3 className="mt-1 line-clamp-2 min-h-[2.75rem] font-medium leading-snug">{product.name}</h3>

          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {product.description || "\u00A0"}
          </p>

          <div className="mt-3 flex items-end justify-between gap-2">
            <div className="min-h-[2.5rem]">
              <div className="font-semibold tabular-nums">{money(unitPrice(product))}</div>
              <div className="text-xs text-muted-foreground line-through tabular-nums">
                {product.discount_price != null ? money(Number(product.price)) : "\u00A0"}
              </div>
            </div>
            <span className="min-h-[1rem] text-right text-xs text-amber-600 dark:text-amber-400">
              {out ? "\u00A0" : product.stock <= 5 ? `Only ${product.stock} left` : "\u00A0"}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Quantity</span>
            <QuantityStepper value={qty} max={max} onChange={setQty} disabled={out}
              label={`quantity of ${product.name}`} />
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={add} disabled={out}>
              <ShoppingCart className="h-4 w-4" aria-hidden />
              Add
              <span className="sr-only"> {qty} {product.name} to cart</span>
            </Button>
            <Button size="sm" className="flex-1" onClick={() => onBuy(qty)} disabled={out}>
              {out ? "Unavailable" : "Buy now"}
              <span className="sr-only">, {product.name}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function VariantPickerDialog({ picking, onOpenChange, onConfirm }: {
  picking: { product: Product; intent: "cart" | "buy"; quantity: number } | null;
  onOpenChange: (o: boolean) => void;
  onConfirm: (product: Product, variant: string, quantity: number, intent: "cart" | "buy") => void;
}) {
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => { setVariant(""); setQuantity(picking?.quantity ?? 1); setError(undefined); }, [picking]);

  if (!picking) return null;

  const { product, intent } = picking;
  const options = (product.variants ?? []).map((v) => `${v.name}: ${v.value}`);
  const max = Math.min(product.stock, 99);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl p-5 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Pick an option before adding this to your order.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vp-variant">Option <span className="text-destructive" aria-hidden>*</span></Label>
            <Select value={variant || undefined} onValueChange={(v) => { setVariant(v); setError(undefined); }}>
              <SelectTrigger id="vp-variant" aria-invalid={!!error || undefined}
                aria-describedby={error ? "vp-variant-error" : undefined}>
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent>
                {options.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {error && <p id="vp-variant-error" role="alert" className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex items-center justify-between">
            <Label>Quantity</Label>
            <QuantityStepper value={quantity} max={max} onChange={setQuantity} label="quantity" />
          </div>

          <div className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span>Subtotal</span>
            <span className="font-semibold tabular-nums">{money(unitPrice(product) * quantity)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => {
            if (!variant) { setError("Choose an option."); return; }
            onConfirm(product, variant, quantity, intent);
          }}>
            {intent === "cart" ? "Add to cart" : "Buy now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Cart dialog                                                         */
/* ------------------------------------------------------------------ */

function CartDialog({ open, onOpenChange, cart, onCheckout }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  cart: ReturnType<typeof useCart>; onCheckout: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription>
            {cart.count > 0 ? `${cart.count} item${cart.count > 1 ? "s" : ""} ready to order.` : "Nothing here yet."}
          </DialogDescription>
        </DialogHeader>

        {cart.lines.length === 0 ? (
          <StateMessage icon={ShoppingCart} title="Your cart is empty" body="Add products from the Browse tab to start an order." />
        ) : (
          <>
            <ul className="space-y-3">
              {cart.lines.map((l) => {
                const key = lineKey(l);
                return (
                  <li key={key} className="flex gap-3 rounded-lg border p-3">
                    {l.image_url ? (
                      <img src={l.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      {l.variant && <p className="text-xs text-muted-foreground">{l.variant}</p>}
                      <p className="text-xs text-muted-foreground tabular-nums">{money(l.unit_price)} each</p>
                      <div className="flex items-center gap-2 pt-1">
                        <QuantityStepper value={l.quantity} max={Math.max(1, l.stock)}
                          onChange={(n) => cart.setQuantity(key, n)} label={`quantity of ${l.name}`} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => cart.remove(key)} aria-label={`Remove ${l.name} from cart`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(l.unit_price * l.quantity)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums">{money(cart.subtotal)}</span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={cart.clear} className="sm:mr-auto">Empty cart</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Keep shopping</Button>
              <Button onClick={onCheckout}>Checkout, {money(cart.subtotal)}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Checkout: details -> pay -> done                                    */
/* ------------------------------------------------------------------ */

type CheckoutForm = {
  name: string; phone: string; email: string; address: string; notes: string; method: "upi" | "cod";
};
type CheckoutErrors = Partial<Record<keyof CheckoutForm | "utr", string>>;

function CheckoutDialog({ lines, user, onOpenChange, onPlaced, onFinished }: {
  lines: CartLine[] | null;
  user: { id: string; email?: string };
  onOpenChange: (o: boolean) => void;
  onPlaced: () => void;
  onFinished: () => void;
}) {
  const [step, setStep] = useState<"details" | "pay" | "done">("details");
  const [placed, setPlaced] = useState<MyOrder | null>(null);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [form, setForm] = useState<CheckoutForm>({
    name: "", phone: "", email: "", address: "", notes: "", method: "upi",
  });

  useEffect(() => {
    if (!lines) return;
    setStep("details");
    setPlaced(null);
    setUtr("");
    setErrors({});
    setForm({ name: "", phone: "", email: user.email ?? "", address: "", notes: "", method: "upi" });
  }, [lines, user.email]);

  if (!lines || lines.length === 0) return null;

  const total = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  const set = <K extends keyof CheckoutForm>(k: K, v: CheckoutForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): CheckoutErrors => {
    const e: CheckoutErrors = {};
    if (!form.name.trim()) e.name = "Enter a contact name.";
    if (!/^[+\d][\d\s-]{7,15}$/.test(form.phone.trim())) e.phone = "Enter a valid phone number.";
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = "Enter a valid email address.";
    if (form.address.trim().length < 10) e.address = "Enter the full delivery address.";
    return e;
  };

  const placeOrder = async () => {
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) { toast.error("Check the highlighted fields."); return; }

    setBusy(true);
    const { data, error } = await db.rpc("place_cart_order", {
      p_items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, variant: l.variant })),
      p_customer_name: form.name.trim(),
      p_customer_phone: form.phone.trim(),
      p_customer_email: form.email.trim(),
      p_delivery_address: form.address.trim(),
      p_notes: form.notes.trim() || null,
      p_payment_method: form.method,
    });
    setBusy(false);

    if (error) { toast.error(error.message); return; }
    const order = (Array.isArray(data) ? data[0] : data) as MyOrder;
    setPlaced(order);
    onPlaced();

    if (form.method === "upi") {
      setStep("pay");
    } else {
      toast.success(`Order ${order.order_number} placed. Pay on delivery.`);
      setStep("done");
    }
  };

  const submitUtr = async () => {
    if (!placed) return;
    const ref = utr.trim().toUpperCase();
    if (!UTR_PATTERN.test(ref)) {
      setErrors({ utr: "Enter the transaction ID (UTR) from your payment app." });
      return;
    }
    setBusy(true);
    const { error } = await db.rpc("submit_product_order_payment", { p_order_id: placed.id, p_utr: ref });
    setBusy(false);
    if (error) { setErrors({ utr: error.message }); return; }
    toast.success("Payment submitted for verification");
    setStep("done");
  };

  return (
    <Dialog open onOpenChange={(o) => !busy && !o && (step === "details" ? onOpenChange(false) : onFinished())}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        {step === "details" && (
          <>
            <DialogHeader>
              <DialogTitle>Checkout</DialogTitle>
              <DialogDescription>
                {itemCount} item{itemCount > 1 ? "s" : ""}. Choose how you'd like to pay, then confirm delivery details.
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2 rounded-lg border p-3">
              {lines.map((l) => (
                <li key={lineKey(l)} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {l.name}
                    {l.variant && <span className="text-muted-foreground">, {l.variant}</span>}
                    <span className="text-muted-foreground"> × {l.quantity}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money(l.unit_price * l.quantity)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(total)}</span>
              </li>
            </ul>

            <form noValidate onSubmit={(e) => { e.preventDefault(); placeOrder(); }} className="grid gap-4">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Payment method</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { value: "upi", label: "Pay now by UPI", hint: "Scan a QR and share the UTR" },
                    { value: "cod", label: "Pay on delivery", hint: "Settle when the order arrives" },
                  ] as const).map((opt) => (
                    <label key={opt.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm",
                        form.method === opt.value ? "border-primary bg-primary/5" : "hover:bg-accent",
                      )}>
                      <input type="radio" name="payment-method" value={opt.value}
                        checked={form.method === opt.value} onChange={() => set("method", opt.value)} className="mt-1" />
                      <span>
                        <span className="font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Contact name <span className="text-destructive" aria-hidden>*</span></Label>
                  <Input id="c-name" value={form.name} onChange={(e) => set("name", e.target.value)}
                    autoComplete="name" aria-invalid={!!errors.name || undefined}
                    aria-describedby={errors.name ? "c-name-error" : undefined} />
                  {errors.name && <p id="c-name-error" role="alert" className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">Phone <span className="text-destructive" aria-hidden>*</span></Label>
                  <Input id="c-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                    autoComplete="tel" placeholder="+91 98450 00000" aria-invalid={!!errors.phone || undefined}
                    aria-describedby={errors.phone ? "c-phone-error" : undefined} />
                  {errors.phone && <p id="c-phone-error" role="alert" className="text-xs text-destructive">{errors.phone}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  autoComplete="email" aria-invalid={!!errors.email || undefined}
                  aria-describedby={errors.email ? "c-email-error" : undefined} />
                {errors.email && <p id="c-email-error" role="alert" className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-address">Delivery address <span className="text-destructive" aria-hidden>*</span></Label>
                <Textarea id="c-address" rows={3} value={form.address} onChange={(e) => set("address", e.target.value)}
                  autoComplete="street-address" placeholder="Street, area, city, PIN code"
                  aria-invalid={!!errors.address || undefined}
                  aria-describedby={errors.address ? "c-address-error" : undefined} />
                {errors.address && <p id="c-address-error" role="alert" className="text-xs text-destructive">{errors.address}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-notes">Delivery notes</Label>
                <Textarea id="c-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                  placeholder="Landmark, preferred delivery time, anything else" />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {form.method === "upi" ? `Continue to payment, ${money(total)}` : `Place order, ${money(total)}`}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "pay" && placed && (
          <>
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <QrCode className="h-4 w-4 text-primary" aria-hidden />
                Pay for {placed.order_number}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Scan with any UPI app, pay the exact amount, then enter the transaction ID.
              </DialogDescription>
            </DialogHeader>

            <UpiPayPanel
              amount={Number(placed.total_amount)}
              reference={placed.order_number}
              label={placed.product_name}
              utr={utr}
              onUtrChange={(v) => { setUtr(v); if (errors.utr) setErrors({}); }}
              error={errors.utr}
            />

            <DialogFooter>
              <Button className="w-full" onClick={submitUtr} disabled={busy || !utr}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                I've paid
              </Button>
            </DialogFooter>
            <p className="text-center text-[11px] text-muted-foreground">
              Your order is saved. If you close this, you can pay from My orders.
            </p>
          </>
        )}

        {step === "done" && placed && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircle2 className="h-11 w-11 text-emerald-600" aria-hidden />
            <DialogHeader className="items-center space-y-1">
              <DialogTitle className="text-base">Order {placed.order_number} placed</DialogTitle>
              <DialogDescription className="text-sm">
                {form.method === "upi"
                  ? `We've recorded your payment of ${money(Number(placed.total_amount))}. It shows as paid once the admin verifies the transaction ID.`
                  : `Pay ${money(Number(placed.total_amount))} when the order is delivered.`}
              </DialogDescription>
            </DialogHeader>
            {form.method === "upi" && utr && (
              <div className="text-xs text-muted-foreground">UTR <span className="font-mono">{utr.toUpperCase()}</span></div>
            )}
            <Button className="mt-2" onClick={onFinished}>View my orders</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Shared UPI panel                                                    */
/* ------------------------------------------------------------------ */

function UpiPayPanel({ amount, reference, label, utr, onUtrChange, error }: {
  amount: number; reference: string; label: string;
  utr: string; onUtrChange: (v: string) => void; error?: string;
}) {
  const upiUrl = buildUpiUrl(amount, `${reference} ${label}`);

  return (
    <div className="space-y-3">
      <div className="flex justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="font-semibold tabular-nums">{money(amount)}</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* White background keeps the QR scannable in dark mode */}
        <div className="rounded-xl border bg-white p-2.5">
          <QRCodeSVG value={upiUrl} size={168} level="M" />
        </div>
        <div className="text-center text-xs leading-relaxed text-muted-foreground">
          Paying <span className="font-medium text-foreground">{UPI_PAYEE_NAME}</span>
          <br />
          <span className="break-all">{UPI_ID}</span> · Ref {reference}
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full md:hidden">
          <a href={upiUrl}><Smartphone className="mr-1 h-4 w-4" aria-hidden />Open UPI app</a>
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="pay-utr" className="text-xs">UPI transaction ID (UTR)</Label>
        <Input
          id="pay-utr" value={utr} autoComplete="off" placeholder="e.g. 412345678901" className="rounded-lg"
          onChange={(e) => onUtrChange(e.target.value.replace(/\s+/g, ""))}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "pay-utr-error" : "pay-utr-hint"}
        />
        {error
          ? <p id="pay-utr-error" role="alert" className="text-xs text-destructive">{error}</p>
          : <p id="pay-utr-hint" className="text-[11px] text-muted-foreground">Copy the 12-digit transaction ID from your UPI app after paying.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My orders                                                           */
/* ------------------------------------------------------------------ */

function MyOrdersTab({ orders, loading, error, reload, onShop }: {
  orders: MyOrder[]; loading: boolean; error: string | null; reload: () => void; onShop: () => void;
}) {
  const [toCancel, setToCancel] = useState<MyOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState<MyOrder | null>(null);
  const [viewing, setViewing] = useState<MyOrder | null>(null);

  const cancelOrder = async () => {
    if (!toCancel) return;
    setCancelling(true);
    const { error } = await db.rpc("cancel_my_product_order", { p_order_id: toCancel.id });
    setCancelling(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toCancel.order_number} cancelled`);
    setToCancel(null);
    reload();
  };

  if (error) {
    return <Card><StateMessage
      icon={AlertCircle} title="Orders didn't load" body={error}
      action={<Button variant="outline" onClick={reload} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>}
    /></Card>;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-2/3" />
          </CardContent></Card>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return <Card><StateMessage
      icon={ShoppingBag} title="No orders yet" body="Anything you order will show up here with its payment and delivery status."
      action={<Button onClick={onShop}>Browse products</Button>}
    /></Card>;
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const pay = PAYMENT_META[o.payment_status];
        const needsPayment = o.order_status !== "cancelled" && o.payment_method !== "cod" &&
          (o.payment_status === "pending" || o.payment_status === "rejected");

        return (
          <Card
            key={o.id}
            role="button"
            tabIndex={0}
            aria-label={`Order ${o.order_number}, ${o.product_name}. Open details`}
            onClick={() => setViewing(o)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewing(o); } }}
            className="cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                {o.product_image_url ? (
                  <img src={o.product_image_url} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.order_number}</span>
                    <Pill tone={orderTone[o.order_status]}>{title(o.order_status)}</Pill>
                    <Pill tone={pay.tone}>{pay.label}</Pill>
                  </div>
                  <p className="truncate text-sm">
                    {o.product_name}
                    {o.variant && <span className="text-muted-foreground">, {o.variant}</span>}
                    <span className="text-muted-foreground"> · {o.quantity} item{o.quantity > 1 ? "s" : ""}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Placed {dateTime(o.created_at)}
                    {o.payment_method === "cod" && <> · Pay on delivery</>}
                    {o.utr && <> · UTR <span className="font-mono">{o.utr}</span></>}
                  </p>
                  {o.payment_status === "rejected" && (
                    <p className="text-xs text-destructive">
                      {o.rejection_reason || "The payment couldn't be verified."} Pay again with a valid transaction ID.
                    </p>
                  )}
                  {o.payment_status === "pending_approval" && (
                    <p className="text-xs text-muted-foreground">Waiting for the admin to verify your payment.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                <span className="font-semibold tabular-nums">{money(Number(o.total_amount))}</span>
                <div className="flex gap-2">
                  {needsPayment && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setPaying(o); }}>
                      {o.payment_status === "rejected" ? "Pay again" : "Pay now"}
                    </Button>
                  )}
                  {o.order_status === "pending" && (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setToCancel(o); }}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <OrderDetailDialog
        order={viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        onPay={(order) => { setViewing(null); setPaying(order); }}
        onCancel={(order) => { setViewing(null); setToCancel(order); }}
      />

      <PayOrderDialog order={paying} onOpenChange={(o) => !o && setPaying(null)}
        onPaid={() => { setPaying(null); reload(); }} />

      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && !cancelling && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {toCancel?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. If you've already paid, the admin will arrange a refund.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep order</AlertDialogCancel>
            <AlertDialogAction disabled={cancelling}
              onClick={(e) => { e.preventDefault(); cancelOrder(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderDetailDialog({ order, onOpenChange, onPay, onCancel }: {
  order: MyOrder | null;
  onOpenChange: (o: boolean) => void;
  onPay: (order: MyOrder) => void;
  onCancel: (order: MyOrder) => void;
}) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!order) { setItems([]); return; }
    let live = true;
    setLoadingItems(true);
    db.from("product_order_items").select("*").eq("order_id", order.id).order("created_at")
      .then(({ data }: { data: OrderItem[] | null }) => {
        if (!live) return;
        setItems(data ?? []);
        setLoadingItems(false);
      });
    return () => { live = false; };
  }, [order]);

  if (!order) return null;

  const pay = PAYMENT_META[order.payment_status];
  const cancelled = order.order_status === "cancelled";
  const reached = ORDER_TRAIL.indexOf(order.order_status);
  const canPay = !cancelled && order.payment_method !== "cod" &&
    (order.payment_status === "pending" || order.payment_status === "rejected");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Order {order.order_number}</DialogTitle>
          <DialogDescription>Placed {dateTime(order.created_at)}</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="mo-items" className="space-y-2">
          <h3 id="mo-items" className="text-sm font-semibold">Items</h3>
          {loadingItems ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="flex gap-3 rounded-lg border p-3">
                  {it.product_image_url ? (
                    <img src={it.product_image_url} alt={it.product_name}
                      className="h-16 w-16 shrink-0 rounded-md border object-cover" />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                    <p className="font-medium">{it.product_name}</p>
                    {it.variant && <p className="text-muted-foreground">{it.variant}</p>}
                    <p className="text-muted-foreground tabular-nums">{money(Number(it.unit_price))} × {it.quantity}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(Number(it.line_total))}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(Number(order.total_amount))}</span>
              </li>
            </ul>
          )}
        </section>

        <div className="rounded-lg border p-3">
          {cancelled ? (
            <div className="flex items-center gap-2 text-sm">
              <Pill tone="danger">Cancelled</Pill>
              <span className="text-muted-foreground">This order was cancelled.</span>
            </div>
          ) : (
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {ORDER_TRAIL.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 font-medium",
                    i <= reached ? toneCls[orderTone[s]] : "text-muted-foreground")}>
                    {title(s)}
                  </span>
                  {i < ORDER_TRAIL.length - 1 && <span aria-hidden className="text-muted-foreground">→</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        <section aria-labelledby="mo-payment" className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="mo-payment" className="text-sm font-semibold">Payment</h3>
            <Pill tone={pay.tone}>{pay.label}</Pill>
          </div>
          <dl className="space-y-1.5">
            <DetailRow label="Method">{order.payment_method === "cod" ? "Pay on delivery" : "UPI"}</DetailRow>
            {order.payment_method !== "cod" && (
              <DetailRow label="Transaction ID">
                {order.utr ? <span className="font-mono">{order.utr}</span> : "Not submitted yet"}
              </DetailRow>
            )}
            {order.paid_at && <DetailRow label="Confirmed on">{dateTime(order.paid_at)}</DetailRow>}
            {order.payment_status === "rejected" && (
              <DetailRow label="Reason">
                <span className="text-destructive">{order.rejection_reason || "The payment couldn't be verified."}</span>
              </DetailRow>
            )}
          </dl>
          {order.payment_status === "pending_approval" && (
            <p className="text-xs text-muted-foreground">Waiting for the admin to verify your payment.</p>
          )}
        </section>

        <section aria-labelledby="mo-delivery" className="space-y-2">
          <h3 id="mo-delivery" className="text-sm font-semibold">Delivery</h3>
          <dl className="space-y-1.5">
            <DetailRow label="Name">{order.customer_name}</DetailRow>
            <DetailRow label="Phone">{order.customer_phone ?? "Not provided"}</DetailRow>
            <DetailRow label="Email"><span className="break-all">{order.customer_email ?? "Not provided"}</span></DetailRow>
            <DetailRow label="Address"><span className="whitespace-pre-line">{order.delivery_address}</span></DetailRow>
            {order.notes && <DetailRow label="Notes">{order.notes}</DetailRow>}
          </dl>
        </section>

        <DialogFooter className="gap-2 sm:gap-0">
          {order.order_status === "pending" && (
            <Button variant="ghost" onClick={() => onCancel(order)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto">
              Cancel order
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canPay && (
            <Button onClick={() => onPay(order)}>
              {order.payment_status === "rejected" ? "Pay again" : "Pay now"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayOrderDialog({ order, onOpenChange, onPaid }: {
  order: MyOrder | null; onOpenChange: (o: boolean) => void; onPaid: () => void;
}) {
  const [utr, setUtr] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUtr(""); setError(undefined); }, [order]);

  if (!order) return null;

  const submit = async () => {
    const ref = utr.trim().toUpperCase();
    if (!UTR_PATTERN.test(ref)) {
      setError("Enter the transaction ID (UTR) from your payment app.");
      return;
    }
    setBusy(true);
    const { error } = await db.rpc("submit_product_order_payment", { p_order_id: order.id, p_utr: ref });
    setBusy(false);
    if (error) { setError(error.message); return; }
    toast.success("Payment submitted for verification");
    onPaid();
  };

  return (
    <Dialog open onOpenChange={(o) => !busy && !o && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-sm">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-primary" aria-hidden />
            Pay for {order.order_number}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Scan with any UPI app, pay the exact amount, then enter the transaction ID.
          </DialogDescription>
        </DialogHeader>

        <UpiPayPanel
          amount={Number(order.total_amount)}
          reference={order.order_number}
          label={order.product_name}
          utr={utr}
          onUtrChange={(v) => { setUtr(v); setError(undefined); }}
          error={error}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button onClick={submit} disabled={busy || !utr}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            I've paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}