import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertCircle, BadgeCheck, CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, ImagePlus, IndianRupee,
  Loader2, Package, PackageCheck, PackageX, Pencil, Plus, RefreshCw, Search, ShoppingBag, Trash2, Wallet, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({ component: ProductsPage });

// New tables aren't in the generated Supabase types until you regenerate them.
const db = supabase as any;

/* ------------------------------------------------------------------ */
/* Config & types                                                      */
/* ------------------------------------------------------------------ */

// Edit to match your catalogue.
const CATEGORIES = ["Kitchen equipment", "Packaging", "Printing supplies", "Uniforms", "Tableware", "Other"];

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
const PAYMENT_STATUSES = ["pending", "pending_approval", "paid", "rejected", "failed", "refunded"] as const;

type ProductStatus = "active" | "inactive";
type OrderStatus = (typeof ORDER_STATUSES)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

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
  status: ProductStatus;
  image_url: string | null;
  variants: Variant[];
  created_at: string;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  total_amount: number;
  payment_method: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  utr: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
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

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ProductsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
        <p className="text-sm text-muted-foreground">Manage your catalogue, verify payments and track orders.</p>
      </div>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" className="gap-2"><Package className="h-4 w-4" aria-hidden />Products</TabsTrigger>
          <TabsTrigger value="orders" className="gap-2"><ShoppingBag className="h-4 w-4" aria-hidden />Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-6"><ProductsTab /></TabsContent>
        <TabsContent value="orders" className="mt-6"><OrdersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

function useTable<T>(table: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await db.from(table).select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as T[]);
    setLoading(false);
  }, [table]);

  useEffect(() => { reload(); }, [reload]);
  return { rows, setRows, loading, error, reload };
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", toneCls[tone])}>
      {children}
    </span>
  );
}

// Each stage gets its own colour so a glance down the column reads as progress.
const ORDER_STATUS_STYLE: Record<OrderStatus, { dot: string; chip: string }> = {
  pending: { dot: "bg-amber-500", chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  confirmed: { dot: "bg-sky-500", chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  processing: { dot: "bg-indigo-500", chip: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" },
  shipped: { dot: "bg-violet-500", chip: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  delivered: { dot: "bg-emerald-500", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  cancelled: { dot: "bg-destructive", chip: "border-destructive/30 bg-destructive/10 text-destructive" },
};

function StatusDot({ status }: { status: OrderStatus }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", ORDER_STATUS_STYLE[status].dot)} aria-hidden />;
}

function OrderStatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
      ORDER_STATUS_STYLE[status].chip)}>
      <StatusDot status={status} />
      {title(status)}
    </span>
  );
}

const PAYMENT_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Unpaid", tone: "neutral" },
  pending_approval: { label: "Verify payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "info" },
};

function StatCard({ label, value, icon: Icon, tone, large, className }: {
  label: string; value: ReactNode; icon: typeof Package; tone: Tone; large?: boolean; className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn("grid shrink-0 place-items-center rounded-lg", large ? "h-12 w-12" : "h-10 w-10", toneCls[tone])}>
          <Icon className={large ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("truncate font-semibold tabular-nums", large ? "text-2xl" : "text-xl")}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}><Skeleton className="h-5 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function StateMessage({ icon: Icon, title, body, action }: {
  icon: typeof Package; title: string; body: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const PAGE_SIZE = 10;

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
        </Button>
      </div>
    </nav>
  );
}

// Card header that folds the table away; the chevron points at what a click does.
function TableToggle({ id, title, count, open, onToggle }: {
  id: string; title: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({count})</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {open ? "Hide" : "Show"}
        {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
      </span>
    </button>
  );
}

function FilterSelect({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function SearchBox({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Label htmlFor={id} className="sr-only">{label}</Label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

function Field({ id, label, required, error, hint, children }: {
  id: string; label: string; required?: boolean; error?: string; hint?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const fieldA11y = (id: string, error?: string) => ({
  id,
  "aria-invalid": !!error || undefined,
  "aria-describedby": error ? `${id}-error` : undefined,
});

function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, busy, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: ReactNode;
  confirmLabel: string; busy?: boolean; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Products tab                                                        */
/* ------------------------------------------------------------------ */

function ProductsTab() {
  const { rows, loading, error, reload } = useTable<Product>("products");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((p) => p.status === "active").length,
    outOfStock: rows.filter((p) => p.stock <= 0).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((p) =>
      (!s || p.name.toLowerCase().includes(s)) &&
      (category === "all" || p.category === category) &&
      (status === "all" || p.status === status),
    );
  }, [rows, q, category, status]);

  const hasFilters = q !== "" || category !== "all" || status !== "all";
  const clearFilters = () => { setQ(""); setCategory("all"); setStatus("all"); };

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(true);
  useEffect(() => { setPage(1); }, [q, category, status, rows.length]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setFormOpen(true); };

  const deleteProduct = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await db.from("products").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) { toast.error(`Couldn't delete product: ${error.message}`); return; }
    toast.success(`Deleted "${toDelete.name}"`);
    setToDelete(null);
    reload();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total products" value={stats.total} icon={Package} tone="info" />
        <StatCard label="Active" value={stats.active} icon={PackageCheck} tone="success" />
        <StatCard label="Out of stock" value={stats.outOfStock} icon={PackageX} tone={stats.outOfStock ? "danger" : "neutral"} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <SearchBox id="product-search" label="Search products by name" value={q} onChange={setQ} placeholder="Search by name" />
          <FilterSelect
            id="product-category" label="Filter by category" value={category} onChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <FilterSelect
            id="product-status" label="Filter by status" value={status} onChange={setStatus}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>
        <Button onClick={openCreate} className="gap-2 self-start lg:self-auto">
          <Plus className="h-4 w-4" aria-hidden /> Add product
        </Button>
      </div>

      <Card className="overflow-hidden">
        <TableToggle id="products-table" title="Product list" count={filtered.length}
          open={open} onToggle={() => setOpen((o) => !o)} />
        <div id="products-table" hidden={!open} className="border-t">
        {error ? (
          <StateMessage
            icon={AlertCircle} title="Products didn't load" body={error}
            action={<Button variant="outline" onClick={reload} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          <StateMessage
            icon={Package} title="No products yet" body="Add your first product to start taking orders."
            action={<Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" aria-hidden />Add product</Button>}
          />
        ) : !loading && filtered.length === 0 ? (
          <StateMessage
            icon={Search} title="No matching products" body="Try a different name or clear the filters."
            action={hasFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-hidden">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableSkeleton cols={6} /> : paged.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex min-w-[220px] items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-11 w-11 shrink-0 rounded-md border object-cover" />
                        ) : (
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            SKU {p.sku}
                            {p.variants?.length > 0 && `, ${p.variants.length} variant${p.variants.length > 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{p.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.discount_price != null ? (
                        <div>
                          <div className="font-medium">{money(Number(p.discount_price))}</div>
                          <div className="text-xs text-muted-foreground line-through">{money(Number(p.price))}</div>
                        </div>
                      ) : (
                        <span className="font-medium">{money(Number(p.price))}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.stock <= 0 ? <Pill tone="danger">Out of stock</Pill>
                        : p.stock <= 5 ? <Pill tone="warning">{p.stock} left</Pill>
                        : p.stock}
                    </TableCell>
                    <TableCell>
                      <Pill tone={p.status === "active" ? "success" : "neutral"}>{title(p.status)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(p)} aria-label={`Delete ${p.name}`}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            {!loading && <Pagination page={page} total={filtered.length} onPage={setPage} />}
          </>
        )}
        </div>
      </Card>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} onSaved={reload} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && !deleting && setToDelete(null)}
        title="Delete this product?"
        body={<>"{toDelete?.name}" and its image will be removed permanently. Past orders keep the product name.</>}
        confirmLabel="Delete product"
        busy={deleting}
        onConfirm={deleteProduct}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product form                                                        */
/* ------------------------------------------------------------------ */

type VariantDraft = { name: string; value: string; price: string; stock: string };
type FormState = {
  name: string; description: string; category: string; price: string; discount_price: string;
  stock: string; sku: string; status: ProductStatus; image_url: string; variants: VariantDraft[];
};
type Errors = Partial<Record<keyof FormState, string>> & { variantRows?: Record<number, string> };

const EMPTY_FORM: FormState = {
  name: "", description: "", category: "", price: "", discount_price: "",
  stock: "", sku: "", status: "active", image_url: "", variants: [],
};

const toForm = (p: Product): FormState => ({
  name: p.name,
  description: p.description ?? "",
  category: p.category,
  price: String(p.price),
  discount_price: p.discount_price != null ? String(p.discount_price) : "",
  stock: String(p.stock),
  sku: p.sku,
  status: p.status,
  image_url: p.image_url ?? "",
  variants: (p.variants ?? []).map((v) => ({
    name: v.name, value: v.value,
    price: v.price != null ? String(v.price) : "",
    stock: v.stock != null ? String(v.stock) : "",
  })),
});

function validate(f: FormState): Errors {
  const e: Errors = {};
  const price = Number(f.price);
  const discount = f.discount_price === "" ? null : Number(f.discount_price);
  const stock = Number(f.stock);

  if (!f.name.trim()) e.name = "Enter a product name.";
  else if (f.name.trim().length > 120) e.name = "Keep the name under 120 characters.";
  if (f.description.length > 2000) e.description = "Keep the description under 2,000 characters.";
  if (!f.category) e.category = "Choose a category.";
  if (f.price === "" || Number.isNaN(price) || price <= 0) e.price = "Enter a price greater than 0.";
  if (discount != null) {
    if (Number.isNaN(discount) || discount < 0) e.discount_price = "Enter 0 or more, or leave blank.";
    else if (!e.price && discount >= price) e.discount_price = "Discount price must be lower than the regular price.";
  }
  if (f.stock === "" || !Number.isInteger(stock) || stock < 0) e.stock = "Enter a whole number, 0 or more.";
  if (!f.sku.trim()) e.sku = "Enter a SKU.";
  else if (!/^[A-Za-z0-9_-]+$/.test(f.sku.trim())) e.sku = "Use letters, numbers, dashes or underscores only.";

  if (f.image_url.trim()) {
    const url = f.image_url.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) e.image_url = "Enter a full URL starting with https://";
    else if (url.length > 2000) e.image_url = "That URL is too long.";
  }

  const rowErrors: Record<number, string> = {};
  f.variants.forEach((v, i) => {
    if (!v.name.trim() || !v.value.trim()) rowErrors[i] = "Enter both a variant type and a value.";
    else if (v.price !== "" && (Number.isNaN(Number(v.price)) || Number(v.price) < 0)) rowErrors[i] = "Variant price must be 0 or more.";
    else if (v.stock !== "" && (!Number.isInteger(Number(v.stock)) || Number(v.stock) < 0)) rowErrors[i] = "Variant stock must be a whole number, 0 or more.";
  });
  if (Object.keys(rowErrors).length) e.variantRows = rowErrors;
  return e;
}

function ProductFormDialog({ open, onOpenChange, product, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; product: Product | null; onSaved: () => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(product ? toForm(product) : EMPTY_FORM);
    setErrors({});
  }, [open, product]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const setVariant = (i: number, k: keyof VariantDraft, v: string) =>
    setForm((f) => ({ ...f, variants: f.variants.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)) }));
  const addVariant = () =>
    setForm((f) => ({ ...f, variants: [...f.variants, { name: "", value: "", price: "", stock: "" }] }));
  const removeVariant = (i: number) =>
    setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));

  const save = async () => {
    const e = validate(form);
    setErrors(e);
    if (Object.values(e).some(Boolean)) { toast.error("Check the highlighted fields."); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      price: Number(form.price),
      discount_price: form.discount_price === "" ? null : Number(form.discount_price),
      stock: Number(form.stock),
      sku: form.sku.trim(),
      status: form.status,
      image_url: form.image_url.trim() || null,
      variants: form.variants.map((v) => ({
        name: v.name.trim(),
        value: v.value.trim(),
        price: v.price === "" ? null : Number(v.price),
        stock: v.stock === "" ? null : Number(v.stock),
      })),
    };

    const { error } = isEdit
      ? await db.from("products").update(payload).eq("id", product!.id)
      : await db.from("products").insert(payload);
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        setErrors((x) => ({ ...x, sku: "This SKU is already in use." }));
        toast.error("That SKU is already in use.");
        return;
      }
      toast.error(error.message);
      return;
    }

    toast.success(isEdit ? "Product updated" : "Product added");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>Fields marked * are required.</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-5">
          <Field id="p-image" label="Product image URL" error={errors.image_url}
            hint="Paste a direct link to a JPG, PNG or WebP. Leave blank for no image.">
            <div className="flex items-start gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                {form.image_url.trim() ? (
                  <img
                    src={form.image_url.trim()}
                    alt="Product image preview"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "visible"; }}
                  />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  {...fieldA11y("p-image", errors.image_url)}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://example.com/product.jpg"
                  value={form.image_url}
                  onChange={(e) => set("image_url", e.target.value)}
                />
                {form.image_url.trim() && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("image_url", "")} className="gap-1">
                    <X className="h-4 w-4" aria-hidden /> Clear
                  </Button>
                )}
              </div>
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="p-name" label="Product name" required error={errors.name}>
              <Input {...fieldA11y("p-name", errors.name)} value={form.name} maxLength={120}
                onChange={(e) => set("name", e.target.value)} autoComplete="off" />
            </Field>
            <Field id="p-sku" label="SKU / product ID" required error={errors.sku}>
              <Input {...fieldA11y("p-sku", errors.sku)} value={form.sku}
                onChange={(e) => set("sku", e.target.value.toUpperCase())} autoComplete="off" placeholder="e.g. PRN-ROLL-80" />
            </Field>
          </div>

          <Field id="p-desc" label="Description" error={errors.description}>
            <Textarea {...fieldA11y("p-desc", errors.description)} rows={3} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="p-category" label="Category" required error={errors.category}>
              <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                <SelectTrigger {...fieldA11y("p-category", errors.category)}>
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field id="p-status" label="Status" required hint="Inactive products are hidden from customers.">
              <Select value={form.status} onValueChange={(v) => set("status", v as ProductStatus)}>
                <SelectTrigger id="p-status" aria-describedby="p-status-hint"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="p-price" label="Regular price (₹)" required error={errors.price}>
              <Input {...fieldA11y("p-price", errors.price)} type="number" inputMode="decimal" min="0" step="0.01"
                value={form.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field id="p-discount" label="Discount price (₹)" error={errors.discount_price}>
              <Input {...fieldA11y("p-discount", errors.discount_price)} type="number" inputMode="decimal" min="0" step="0.01"
                value={form.discount_price} onChange={(e) => set("discount_price", e.target.value)} placeholder="Optional" />
            </Field>
            <Field id="p-stock" label="Stock quantity" required error={errors.stock}>
              <Input {...fieldA11y("p-stock", errors.stock)} type="number" inputMode="numeric" min="0" step="1"
                value={form.stock} onChange={(e) => set("stock", e.target.value)} />
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Variants (optional)</legend>
            <p className="text-xs text-muted-foreground">
              For sizes, colours or types. Leave price or stock blank to use the product's values.
            </p>
            {form.variants.map((v, i) => {
              const rowErr = errors.variantRows?.[i];
              return (
                <div key={i} className="space-y-1">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_110px_90px_auto]">
                    <Input aria-label={`Variant ${i + 1} type`} placeholder="Type, e.g. Size" value={v.name}
                      onChange={(e) => setVariant(i, "name", e.target.value)} aria-invalid={!!rowErr || undefined} />
                    <Input aria-label={`Variant ${i + 1} value`} placeholder="Value, e.g. Large" value={v.value}
                      onChange={(e) => setVariant(i, "value", e.target.value)} aria-invalid={!!rowErr || undefined} />
                    <Input aria-label={`Variant ${i + 1} price`} placeholder="Price" type="number" min="0" step="0.01"
                      value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} />
                    <Input aria-label={`Variant ${i + 1} stock`} placeholder="Stock" type="number" min="0" step="1"
                      value={v.stock} onChange={(e) => setVariant(i, "stock", e.target.value)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(i)}
                      aria-label={`Remove variant ${i + 1}`} className="col-span-2 justify-self-end sm:col-span-1">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {rowErr && <p role="alert" className="text-xs text-destructive">{rowErr}</p>}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addVariant} className="gap-1">
              <Plus className="h-4 w-4" aria-hidden /> Add variant
            </Button>
          </fieldset>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {isEdit ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Orders tab                                                          */
/* ------------------------------------------------------------------ */

function OrderStatusSelect({ id, order, disabled, onChange }: {
  id: string; order: Order; disabled?: boolean; onChange: (next: OrderStatus) => void;
}) {
  return (
    <Select value={order.order_status} onValueChange={(v) => onChange(v as OrderStatus)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={`Order status for ${order.order_number}`}
        className={cn("h-8 w-36 gap-2 font-medium", ORDER_STATUS_STYLE[order.order_status].chip)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORDER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span className="flex items-center gap-2">
              <StatusDot status={s} />
              {title(s)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OrdersTab() {
  const { rows, setRows, loading, error, reload } = useTable<Order>("product_orders");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [viewing, setViewing] = useState<Order | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Order | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((o) => o.order_status === "pending").length,
    toVerify: rows.filter((o) => o.payment_status === "pending_approval").length,
    delivered: rows.filter((o) => o.order_status === "delivered").length,
    revenue: rows
      .filter((o) => o.payment_status === "paid" && o.order_status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total_amount), 0),
    // Money still owed: live orders that aren't paid yet, whatever the reason.
    pendingAmount: rows
      .filter((o) => o.payment_status !== "paid" && o.payment_status !== "refunded" && o.order_status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total_amount), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((o) =>
      (!s || o.order_number.toLowerCase().includes(s) || o.customer_name.toLowerCase().includes(s) ||
        (o.utr ?? "").toLowerCase().includes(s)) &&
      (status === "all" || o.order_status === status) &&
      (payment === "all" || o.payment_status === payment),
    );
  }, [rows, q, status, payment]);

  const hasFilters = q !== "" || status !== "all" || payment !== "all";
  const clearFilters = () => { setQ(""); setStatus("all"); setPayment("all"); };

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(true);
  useEffect(() => { setPage(1); }, [q, status, payment, rows.length]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const patch = (id: string, changes: Partial<Order>) => {
    setRows((rs) => rs.map((o) => (o.id === id ? { ...o, ...changes } : o)));
    setViewing((v) => (v?.id === id ? { ...v, ...changes } : v));
  };

  const updateStatus = async (order: Order, next: OrderStatus) => {
    const prev = order.order_status;
    setBusyId(order.id);
    patch(order.id, { order_status: next });
    const { error } = await db.from("product_orders").update({ order_status: next }).eq("id", order.id);
    setBusyId(null);
    if (error) {
      patch(order.id, { order_status: prev });
      toast.error(`Couldn't update ${order.order_number}: ${error.message}`);
      return;
    }
    toast.success(`${order.order_number} marked ${title(next).toLowerCase()}`);
  };

  const requestStatus = (order: Order, next: OrderStatus) => {
    if (next === order.order_status) return;
    if (next === "cancelled") setPendingCancel(order);
    else updateStatus(order, next);
  };

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    await updateStatus(pendingCancel, "cancelled");
    setPendingCancel(null);
  };

  // Payment verification: match the UTR against your bank or UPI statement first.
  const approvePayment = async (order: Order) => {
    setBusyId(order.id);
    const nextOrderStatus: OrderStatus = order.order_status === "pending" ? "confirmed" : order.order_status;
    const changes = {
      payment_status: "paid" as PaymentStatus,
      paid_at: new Date().toISOString(),
      rejection_reason: null,
      order_status: nextOrderStatus,
    };
    const { error } = await db.from("product_orders").update(changes).eq("id", order.id);
    setBusyId(null);
    if (error) { toast.error(`Couldn't approve payment: ${error.message}`); return; }
    patch(order.id, changes);
    toast.success(`Payment for ${order.order_number} approved`);
  };

  const rejectPayment = async (order: Order, reason: string) => {
    setBusyId(order.id);
    const changes = {
      payment_status: "rejected" as PaymentStatus,
      rejection_reason: reason.trim() || "The payment could not be verified.",
      paid_at: null,
    };
    const { error } = await db.from("product_orders").update(changes).eq("id", order.id);
    setBusyId(null);
    if (error) { toast.error(`Couldn't reject payment: ${error.message}`); return; }
    patch(order.id, changes);
    setRejecting(null);
    toast.success(`Payment for ${order.order_number} rejected`);
  };

  const markPaid = (order: Order) => approvePayment(order);

  // Cash orders can swing back if the money never actually came in.
  const markUnpaid = async (order: Order) => {
    setBusyId(order.id);
    const changes = {
      payment_status: "pending" as PaymentStatus,
      paid_at: null,
      rejection_reason: null,
    };
    const { error } = await db.from("product_orders").update(changes).eq("id", order.id);
    setBusyId(null);
    if (error) { toast.error(`Couldn't update payment: ${error.message}`); return; }
    patch(order.id, changes);
    toast.success(`${order.order_number} marked unpaid`);
  };

  return (
    <div className="space-y-6">
      {/* Money first and wider, counts underneath — the two answer different questions. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard className="lg:col-span-2" large label="Revenue (paid)" value={money(stats.revenue)}
          icon={IndianRupee} tone="success" />
        <StatCard className="lg:col-span-2" large label="Pending amount" value={money(stats.pendingAmount)}
          icon={Wallet} tone={stats.pendingAmount ? "warning" : "neutral"} />

        <StatCard label="Total orders" value={stats.total} icon={ShoppingBag} tone="info" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard label="Payments to verify" value={stats.toVerify} icon={BadgeCheck}
          tone={stats.toVerify ? "warning" : "neutral"} />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} tone="success" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <SearchBox id="order-search" label="Search orders by order ID, customer name or UTR" value={q} onChange={setQ}
          placeholder="Order ID, customer or UTR" />
        <FilterSelect
          id="order-status" label="Filter by order status" value={status} onChange={setStatus}
          options={[{ value: "all", label: "All order statuses" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: title(s) }))]}
        />
        <FilterSelect
          id="order-payment" label="Filter by payment status" value={payment} onChange={setPayment}
          options={[{ value: "all", label: "All payments" },
            ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_META[s].label }))]}
        />
      </div>

      <Card className="overflow-hidden">
        <TableToggle id="orders-table" title="Orders" count={filtered.length}
          open={open} onToggle={() => setOpen((o) => !o)} />
        <div id="orders-table" hidden={!open} className="border-t">
        {error ? (
          <StateMessage
            icon={AlertCircle} title="Orders didn't load" body={error}
            action={<Button variant="outline" onClick={reload} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          <StateMessage icon={ShoppingBag} title="No orders yet" body="Orders from customers will appear here." />
        ) : !loading && filtered.length === 0 ? (
          <StateMessage
            icon={Search} title="No matching orders" body="Try a different search or clear the filters."
            action={hasFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-hidden">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Details</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableSkeleton cols={8} /> : paged.map((o) => {
                  const pay = PAYMENT_META[o.payment_status];
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap font-medium">{o.order_number}</TableCell>
                      <TableCell>
                        <div className="min-w-[140px]">
                          <p className="truncate">{o.customer_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{o.customer_phone ?? o.customer_email ?? "No contact"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="line-clamp-1">{o.product_name}</span>
                        <span className="text-xs text-muted-foreground">Qty {o.quantity}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{money(Number(o.total_amount))}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Pill tone={pay.tone}>{pay.label}</Pill>
                          <p className="text-[11px] text-muted-foreground">
                            {o.payment_method === "cod" ? "On delivery" : o.utr ? <span className="font-mono">{o.utr}</span> : "UPI"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">{dateTime(o.created_at)}</TableCell>
                      <TableCell>
                        <OrderStatusSelect
                          id={`status-${o.id}`} order={o}
                          disabled={busyId === o.id || o.order_status === "cancelled"}
                          onChange={(next) => requestStatus(o, next)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(o)} className="gap-1"
                          aria-label={`View details for ${o.order_number}`}>
                          <Eye className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">View</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            {!loading && <Pagination page={page} total={filtered.length} onPage={setPage} />}
          </>
        )}
        </div>
      </Card>

      <OrderDetailDialog
        order={viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        busy={!!viewing && busyId === viewing.id}
        onStatusChange={requestStatus}
        onApprove={approvePayment}
        onReject={(o) => setRejecting(o)}
        onMarkPaid={markPaid}
        onMarkUnpaid={markUnpaid}
      />

      <RejectPaymentDialog
        order={rejecting}
        busy={!!rejecting && busyId === rejecting.id}
        onOpenChange={(o) => !o && setRejecting(null)}
        onReject={rejectPayment}
      />

      <ConfirmDialog
        open={!!pendingCancel}
        onOpenChange={(o) => !o && setPendingCancel(null)}
        title={`Cancel ${pendingCancel?.order_number ?? "order"}?`}
        body={<>The order for {pendingCancel?.customer_name} will be marked cancelled and can't be changed afterwards. Handle any refund separately.</>}
        confirmLabel="Cancel order"
        busy={!!pendingCancel && busyId === pendingCancel.id}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function OrderDetailDialog({ order, onOpenChange, busy, onStatusChange, onApprove, onReject, onMarkPaid, onMarkUnpaid }: {
  order: Order | null; onOpenChange: (o: boolean) => void; busy: boolean;
  onStatusChange: (order: Order, next: OrderStatus) => void;
  onApprove: (order: Order) => void;
  onReject: (order: Order) => void;
  onMarkPaid: (order: Order) => void;
  onMarkUnpaid: (order: Order) => void;
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

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Order {order.order_number}</DialogTitle>
              <DialogDescription>Placed {dateTime(order.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Label htmlFor="detail-status" className="text-sm">Order status</Label>
              <OrderStatusSelect
                id="detail-status" order={order}
                disabled={busy || order.order_status === "cancelled"}
                onChange={(next) => onStatusChange(order, next)}
              />
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating" />}
              <span className="ml-auto"><OrderStatusChip status={order.order_status} /></span>
            </div>

            <section aria-labelledby="od-payment" className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id="od-payment" className="text-sm font-semibold">Payment</h3>
                <Pill tone={PAYMENT_META[order.payment_status].tone}>{PAYMENT_META[order.payment_status].label}</Pill>
              </div>
              <dl className="space-y-2">
                <DetailRow label="Method">{order.payment_method === "cod" ? "Pay on delivery" : "UPI"}</DetailRow>
                <DetailRow label="Transaction ID">
                  {order.utr ? <span className="font-mono">{order.utr}</span> : "Not submitted"}
                </DetailRow>
                <DetailRow label="Amount"><span className="font-semibold tabular-nums">{money(Number(order.total_amount))}</span></DetailRow>
                {order.paid_at && <DetailRow label="Approved on">{dateTime(order.paid_at)}</DetailRow>}
                {order.rejection_reason && <DetailRow label="Rejection reason">{order.rejection_reason}</DetailRow>}
              </dl>

              {order.payment_status === "pending_approval" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Check this transaction ID against your UPI statement before approving.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => onApprove(order)}>
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                      Approve payment
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(order)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                      Reject
                    </Button>
                  </div>
                </>
              )}

              {order.payment_method === "cod" && order.order_status !== "cancelled" && (
                order.payment_status === "paid" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onMarkUnpaid(order)}>
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                      Mark as unpaid
                    </Button>
                    <span className="text-xs text-muted-foreground">Use this if the cash never came in.</span>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onMarkPaid(order)}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Mark as paid
                  </Button>
                )
              )}
            </section>

            <section aria-labelledby="od-customer" className="space-y-3">
              <h3 id="od-customer" className="text-sm font-semibold">Customer</h3>
              <dl className="space-y-2">
                <DetailRow label="Name">{order.customer_name}</DetailRow>
                <DetailRow label="Phone">
                  {order.customer_phone ? <a className="underline-offset-4 hover:underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a> : "Not provided"}
                </DetailRow>
                <DetailRow label="Email">
                  {order.customer_email ? <a className="break-all underline-offset-4 hover:underline" href={`mailto:${order.customer_email}`}>{order.customer_email}</a> : "Not provided"}
                </DetailRow>
                <DetailRow label="Delivery address"><span className="whitespace-pre-line">{order.delivery_address}</span></DetailRow>
              </dl>
            </section>

            <section aria-labelledby="od-items" className="space-y-3 border-t pt-4">
              <h3 id="od-items" className="text-sm font-semibold">Items</h3>
              {loadingItems ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : (
                <ul className="space-y-2">
                  {items.map((it) => (
                    <li key={it.id} className="flex gap-3 rounded-lg border p-3">
                      {it.product_image_url ? (
                        <img src={it.product_image_url} alt={it.product_name}
                          className="h-14 w-14 shrink-0 rounded-md border object-cover" />
                      ) : (
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border bg-muted">
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
              {order.notes && (
                <dl className="space-y-2"><DetailRow label="Notes">{order.notes}</DetailRow></dl>
              )}
            </section>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectPaymentDialog({ order, busy, onOpenChange, onReject }: {
  order: Order | null; busy: boolean; onOpenChange: (o: boolean) => void;
  onReject: (order: Order, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [order]);

  return (
    <Dialog open={!!order} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Reject payment for {order.order_number}?</DialogTitle>
              <DialogDescription>
                The customer sees this reason and can submit a different transaction ID.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="No matching credit found for this transaction ID." />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button disabled={busy} onClick={() => onReject(order, reason)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Reject payment
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}