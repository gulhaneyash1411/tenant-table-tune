import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Trash2, Star, EyeOff, Check, X,
  UtensilsCrossed, ImagePlus, Loader2, CornerDownRight,
} from "lucide-react";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/menu")({ component: Menu });

const BLUE = "#0B7BFF";

type Category = { id: string; name: string; sort_order: number };
type Item = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_must_try: boolean;
  is_available: boolean;
  sort_order: number | null;
};

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20";

const Thumb = ({ url, size = "h-14 w-14" }: { url?: string | null; size?: string }) => (
  <div className={`${size} shrink-0 overflow-hidden rounded-lg bg-slate-100 grid place-items-center`}>
    {url
      ? <img src={url} alt="" className="h-full w-full object-cover" />
      : <UtensilsCrossed className="h-5 w-5 text-slate-300" />}
  </div>
);

// State reads as a pill and toggles on click — no repeated switch labels down the list
const StatePill = ({
  on, onToggle, onLabel, offLabel, icon, tone = "blue",
}: {
  on: boolean; onToggle: () => void; onLabel: string; offLabel: string;
  icon?: React.ReactNode; tone?: "blue" | "amber";
}) => {
  const active = tone === "amber"
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-blue-50 text-blue-700 ring-blue-200";
  return (
    <button onClick={onToggle} aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition
        ${on ? active : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"}`}>
      {icon}{on ? onLabel : offLabel}
    </button>
  );
};

// ====================
// CONFIRM DIALOG
// ====================
type ConfirmState = {
  title: string;
  body: string;
  confirmLabel?: string;
  workingLabel?: string;
  run: () => Promise<void>;
};

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !working) onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, working]);

  const go = async () => {
    setWorking(true);
    try { await state.run(); } finally { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-5"
      onClick={() => { if (!working) onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true"
        aria-labelledby="confirm-title" aria-describedby="confirm-body"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50">
            <Trash2 className="h-5 w-5 text-rose-600" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold">{state.title}</h2>
            <p id="confirm-body" className="mt-1 text-sm text-slate-500">{state.body}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} disabled={working}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            Cancel
          </button>
          <button autoFocus onClick={go} disabled={working}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            {working && <Loader2 className="h-4 w-4 animate-spin" />}
            {working ? state.workingLabel ?? "Deleting" : state.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================
// ITEM ROW
// ====================
function ItemRow({
  item, onToggle, onEdit, onDelete,
}: {
  item: Item;
  onToggle: (patch: Partial<Item>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`flex items-center gap-4 px-5 py-3.5 ${item.is_available ? "" : "bg-slate-50/60"}`}>
      <Thumb url={item.image_url} />

      <div className={`min-w-0 flex-1 ${item.is_available ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.name}</span>
          {!item.is_available && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <EyeOff className="h-3 w-3" /> Hidden
            </span>
          )}
        </div>
        {item.description && <p className="mt-0.5 truncate text-sm text-slate-500">{item.description}</p>}
      </div>

      <div className="hidden w-20 text-right font-medium tabular-nums sm:block">{money(item.price)}</div>

      <div className="hidden items-center gap-2 md:flex">
        <StatePill on={!!item.is_must_try} tone="amber"
          onToggle={() => onToggle({ is_must_try: !item.is_must_try })}
          icon={<Star className={`h-3 w-3 ${item.is_must_try ? "fill-current" : ""}`} />}
          onLabel="Must try" offLabel="Must try" />
        <StatePill on={!!item.is_available}
          onToggle={() => onToggle({ is_available: !item.is_available })}
          onLabel="On the menu" offLabel="Hidden" />
      </div>

      <div className="flex items-center gap-1">
        <button onClick={onEdit} aria-label={`Edit ${item.name}`}
          className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={onDelete} aria-label={`Delete ${item.name}`}
          className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

// ====================
// ITEM EDITOR
// ====================
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    {hint && <span className="ml-2 text-xs text-slate-400">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
);

function ItemEditor({
  item, categories, onSave, onClose,
}: {
  item: Item;
  categories: Category[];
  onSave: (patch: Partial<Item>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    description: item.description ?? "",
    price: item.price,
    image_url: item.image_url ?? "",
    category_id: item.category_id,
    is_must_try: !!item.is_must_try,
    is_available: !!item.is_available,
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    f.name !== item.name ||
    f.description !== (item.description ?? "") ||
    f.price !== item.price ||
    f.image_url !== (item.image_url ?? "") ||
    f.category_id !== item.category_id ||
    f.is_must_try !== !!item.is_must_try ||
    f.is_available !== !!item.is_available;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const save = async () => {
    if (!f.name.trim()) return toast.error("Give the item a name");
    setSaving(true);
    await onSave({
      name: f.name.trim(),
      description: f.description.trim() || null,
      price: f.price,
      image_url: f.image_url.trim() || null,
      category_id: f.category_id,
      is_must_try: f.is_must_try,
      is_available: f.is_available,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Edit ${item.name}`}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">Edit item</h2>
          <button onClick={onClose} aria-label="Close"
            className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 grid place-items-center ring-1 ring-slate-200">
              {f.image_url
                ? <img src={f.image_url} alt="" className="h-full w-full object-cover" />
                : <ImagePlus className="h-6 w-6 text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <Field label="Photo" hint="square works best">
                <input value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })}
                  placeholder="Paste an image link" className={inputCls} />
              </Field>
            </div>
          </div>

          <Field label="Name">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Price">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                <input value={f.price} inputMode="numeric"
                  onChange={(e) => setF({ ...f, price: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  className={inputCls + " pl-7 tabular-nums"} />
              </div>
            </Field>
            <Field label="Category">
              <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} className={inputCls}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description" hint="one line is plenty">
            <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="What's in it, how it's served" className={inputCls + " resize-none"} />
          </Field>

          <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {[
              {
                key: "is_available" as const, on: f.is_available, title: "Show on the menu",
                sub: f.is_available ? "Customers can order this now." : "Hidden from customers — nobody can order it.",
              },
              {
                key: "is_must_try" as const, on: f.is_must_try, title: "Mark as must try",
                sub: "Highlighted with a star on the customer menu.",
              },
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{row.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{row.sub}</div>
                </div>
                <button onClick={() => setF({ ...f, [row.key]: !row.on })} role="switch" aria-checked={row.on}
                  aria-label={row.title}
                  className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${row.on ? "" : "bg-slate-200"}`}
                  style={row.on ? { background: BLUE } : undefined}>
                  <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${row.on ? "translate-x-5" : ""}`} />
                </button>
              </div>
            ))}
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700">How customers see it</div>
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <Thumb url={f.image_url} size="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{f.name || "Item name"}</span>
                  {f.is_must_try && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{f.description || "No description yet"}</p>
                <div className="mt-1 text-sm font-semibold">{money(f.price)}</div>
              </div>
            </div>
            {!f.is_available && (
              <p className="mt-2 text-xs text-slate-500">This item is hidden, so it won't appear on the customer menu at all.</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={save} disabled={!dirty || saving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: BLUE }}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================
// PAGE
// ====================
function Menu() {
  const [tenant, setTenant] = useState<any>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [catName, setCatName] = useState("");
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const t = await fetchCurrentOutlet(u.user!.id);
    setTenant(t);
    if (!t) { setLoading(false); return; }

    const [{ data: c }, { data: i }] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("tenant_id", t.id).order("sort_order"),
      supabase.from("menu_items").select("*").eq("tenant_id", t.id).order("sort_order"),
    ]);
    const categories = (c || []) as Category[];
    setCats(categories);
    setItems((i || []) as Item[]);
    setActiveId((prev) => (prev && categories.some((x) => x.id === prev) ? prev : categories[0]?.id ?? null));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const active = cats.find((c) => c.id === activeId) ?? null;
  const countFor = (id: string) => items.filter((i) => i.category_id === id).length;
  const totals = useMemo(() => ({
    items: items.length,
    hidden: items.filter((i) => !i.is_available).length,
  }), [items]);

  // Leave rename mode whenever the selected category changes
  useEffect(() => { setRenaming(false); }, [activeId]);

  // --- search: matches category names and item names/descriptions ---
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return cats
      .map((c) => {
        const nameHit = c.name.toLowerCase().includes(q);
        const list = items.filter(
          (i) => i.category_id === c.id &&
            (nameHit || (i.name + " " + (i.description ?? "")).toLowerCase().includes(q)),
        );
        return { cat: c, items: list, nameHit };
      })
      .filter((g) => g.nameHit || g.items.length > 0);
  }, [q, cats, items]);
  const resultCount = results.reduce((n, g) => n + g.items.length, 0);

  const shown = items.filter((i) => i.category_id === activeId);

  const openCategory = (id: string) => { setQuery(""); setActiveId(id); };

  // --- writes ---
  async function addCat() {
    const name = newCat.trim();
    if (!name || !tenant) return;
    setBusy(true);
    const { data, error } = await supabase.from("menu_categories")
      .insert({ name, tenant_id: tenant.id, sort_order: cats.length })
      .select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewCat(""); setAddingCat(false);
    await load();
    if (data?.id) setActiveId(data.id);
    toast.success(`Added ${name}`);
  }

  function startRename(c: Category) { setCatName(c.name); setRenaming(true); }

  async function saveRename() {
    if (!active) return;
    const name = catName.trim();
    if (!name) return toast.error("Give the category a name");
    if (name === active.name) { setRenaming(false); return; }
    setBusy(true);
    const { error } = await supabase.from("menu_categories").update({ name }).eq("id", active.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setRenaming(false);
    await load();
    toast.success(`Renamed to ${name}`);
  }

  // Ask first, delete on confirm
  function askDelCat(c: Category) {
    const n = countFor(c.id);
    setConfirmState({
      title: `Delete ${c.name}?`,
      body: n
        ? `This also removes ${n} item${n > 1 ? "s" : ""} in it. This can't be undone.`
        : "This can't be undone.",
      run: async () => {
        const { error } = await supabase.from("menu_categories").delete().eq("id", c.id);
        if (error) { toast.error(error.message); return; }
        toast.success(`Deleted ${c.name}`);
        await load();
      },
    });
  }

  function askDelItem(item: Item) {
    setConfirmState({
      title: `Delete ${item.name}?`,
      body: "It will be removed from your menu. This can't be undone.",
      run: async () => {
        const before = items;
        setItems((xs) => xs.filter((i) => i.id !== item.id));
        const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
        if (error) { setItems(before); toast.error(error.message); return; }
        toast.success(`Deleted ${item.name}`);
      },
    });
  }

  async function addItem() {
    const name = draft.name.trim();
    if (!name || !tenant || !activeId) return;
    setBusy(true);
    const { error } = await supabase.from("menu_items").insert({
      tenant_id: tenant.id,
      category_id: activeId,
      name,
      price: Number(draft.price) || 0,
      is_available: true,
      sort_order: countFor(activeId),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft({ name: "", price: "" });
    load();
  }

  // Optimistic: flip locally, then persist. Reverts on failure.
  async function updateItem(id: string, patch: Partial<Item>) {
    const before = items;
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    if (error) { setItems(before); toast.error(error.message); return false; }
    return true;
  }

  const editingItem = items.find((i) => i.id === editing) ?? null;

  // --- render ---
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 flex gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-slate-200/70" />)}
        </div>
        <div className="mt-4 h-80 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="mx-auto max-w-md px-5 py-20 text-center text-slate-600">No restaurant found on this account.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
          <div className="mr-auto">
            <p className="text-sm text-slate-500">
              {totals.items} items across {cats.length} categories
              {totals.hidden > 0 && <> · {totals.hidden} hidden from the menu</>}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search categories and items"
              className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        {/* Categories — horizontal strip above the list */}
        <nav aria-label="Menu categories"
          className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
          {cats.map((c) => {
            const on = !q && c.id === activeId;
            const hit = !!q && c.name.toLowerCase().includes(q);
            return (
              <button key={c.id} onClick={() => openCategory(c.id)} aria-current={on ? "true" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition
                  ${on ? "bg-white font-medium shadow-sm ring-1 ring-slate-200"
                       : hit ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                             : "text-slate-600 hover:bg-white/70"}`}
                style={on ? { color: BLUE } : undefined}>
                <span className="whitespace-nowrap">{c.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums
                  ${on ? "bg-blue-50" : hit ? "bg-white/70" : "bg-slate-100 text-slate-500"}`}>
                  {countFor(c.id)}
                </span>
              </button>
            );
          })}

          {addingCat ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCat();
                  if (e.key === "Escape") { setAddingCat(false); setNewCat(""); }
                }}
                placeholder="e.g. Desserts"
                className="w-40 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
              <button onClick={addCat} disabled={!newCat.trim() || busy} aria-label="Add category"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
                style={{ background: BLUE }}>
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => { setAddingCat(false); setNewCat(""); }} aria-label="Cancel"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingCat(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-slate-500 hover:bg-white/70">
              <Plus className="h-4 w-4" /> New category
            </button>
          )}
        </nav>

        {q ? (
          /* Search results — across every category */
          <main className="mt-3 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold">Results for “{query.trim()}”</h2>
              <span className="text-sm text-slate-400">
                {resultCount} item{resultCount === 1 ? "" : "s"} in {results.length} categor{results.length === 1 ? "y" : "ies"}
              </span>
              <button onClick={() => setQuery("")}
                className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Clear
              </button>
            </div>

            {results.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-3 font-medium">Nothing matches that</p>
                <p className="mt-1 text-sm text-slate-500">Try a shorter word, or search by category name.</p>
              </div>
            ) : (
              results.map((g) => (
                <section key={g.cat.id}>
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2">
                    <span className="text-sm font-medium text-slate-600">{g.cat.name}</span>
                    <span className="text-xs text-slate-400">
                      {g.items.length} item{g.items.length === 1 ? "" : "s"}
                    </span>
                    <button onClick={() => openCategory(g.cat.id)}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                      <CornerDownRight className="h-3.5 w-3.5" /> Open category
                    </button>
                  </div>
                  {g.items.length === 0 ? (
                    <p className="px-5 py-3 text-sm text-slate-500">This category matched by name, but has no items yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((item) => (
                        <ItemRow key={item.id} item={item}
                          onToggle={(patch) => updateItem(item.id, patch)}
                          onEdit={() => setEditing(item.id)}
                          onDelete={() => askDelItem(item)} />
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </main>
        ) : (
          /* Items in the selected category */
          <main className="mt-3 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {!active ? (
              <div className="px-5 py-16 text-center">
                <p className="font-medium">Your menu is empty</p>
                <p className="mt-1 text-sm text-slate-500">Start with a category like Starters or Drinks.</p>
                <button onClick={() => setAddingCat(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: BLUE }}>
                  <Plus className="h-4 w-4" /> New category
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                  {renaming ? (
                    <div className="flex flex-1 items-center gap-2">
                      <label htmlFor="cat-name" className="sr-only">Category name</label>
                      <input id="cat-name" autoFocus value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                        className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
                      <button onClick={saveRename} disabled={!catName.trim() || busy}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        style={{ background: BLUE }}>
                        <Check className="h-4 w-4" /> Save
                      </button>
                      <button onClick={() => setRenaming(false)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-base font-semibold">{active.name}</h2>
                      <span className="text-sm text-slate-400">{countFor(active.id)} items</span>
                      <button onClick={() => startRename(active)} aria-label={`Rename ${active.name}`}
                        className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => askDelCat(active)} aria-label={`Delete ${active.name}`}
                        className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>

                {shown.length === 0 ? (
                  <div className="px-5 py-14 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100">
                      <UtensilsCrossed className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="mt-3 font-medium">Nothing in {active.name} yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add your first item below — photos and descriptions can come later.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {shown.map((item) => (
                      <ItemRow key={item.id} item={item}
                        onToggle={(patch) => updateItem(item.id, patch)}
                        onEdit={() => setEditing(item.id)}
                        onDelete={() => askDelItem(item)} />
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addItem()}
                    placeholder={`Add an item to ${active.name}`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                    <input value={draft.price} inputMode="numeric"
                      onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/\D/g, "") })}
                      onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="0"
                      className="w-24 rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-3 text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <button onClick={addItem} disabled={!draft.name.trim() || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: BLUE }}>
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
              </>
            )}
          </main>
        )}
      </div>

      {editingItem && (
        <ItemEditor
          item={editingItem}
          categories={cats}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await updateItem(editingItem.id, patch);
            if (ok) { setEditing(null); toast.success("Saved"); }
          }}
        />
      )}

      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      )}
    </div>
  );
}