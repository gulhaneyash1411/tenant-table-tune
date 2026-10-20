import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Pencil, Trash2, Star, Check, X, Loader2, GripVertical,
  ImagePlus, UtensilsCrossed, CornerDownRight, Building2, RefreshCw,
  Import, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Organization } from "@/hooks/use-session";
import { money } from "@/lib/format";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable,
  horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const sb = supabase as any;
const BLUE = "#0B7BFF";
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20";

type GCategory = {
  id: string;
  global_menu_id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
};

type GItem = {
  id: string;
  global_menu_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_veg: boolean;
  is_must_try: boolean;
  is_available: boolean;
  sort_order: number;
};

type Assignment = {
  id: string;
  global_menu_id: string;
  tenant_id: string;
  last_synced_at: string | null;
};

type GlobalMenu = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  categoryCount?: number;
  itemCount?: number;
  assignedOutlets?: string[];
};

type ConfirmState = { title: string; body: string; run: () => Promise<void> };

// ── Shared UI pieces (mirrors app.menu.tsx) ──

const Thumb = ({ url, size = "h-10 w-10" }: { url: string | null; size?: string }) => (
  <div className={`${size} shrink-0 overflow-hidden rounded-lg bg-slate-100 grid place-items-center ring-1 ring-slate-200/60`}>
    {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-slate-300" />}
  </div>
);

const StatePill = ({ on, label, onToggle, color = "blue" }: {
  on: boolean; label: string; onToggle: () => void; color?: "blue" | "amber";
}) => {
  const bg = on
    ? color === "amber" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-blue-50 text-blue-700 ring-blue-200"
    : "bg-slate-50 text-slate-400 ring-slate-200";
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition ${bg}`}>
      {label}
    </button>
  );
};

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold">{state.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{state.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={running} onClick={async () => { setRunning(true); await state.run(); setRunning(false); onClose(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
            {running && <Loader2 className="h-4 w-4 animate-spin" />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable item row ──

function ItemRow({ item, onToggle, onEdit, onDelete }: {
  item: GItem;
  onToggle: (patch: Partial<GItem>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <li ref={setNodeRef} style={style}
      className="px-4 py-3 text-sm sm:px-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <span {...attributes} {...listeners}
          className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
        <Thumb url={item.image_url} />
        <span className={`inline-block h-4 w-4 shrink-0 rounded-sm border-2 ${item.is_veg ? "border-green-600" : "border-red-600"}`}>
          <span className={`block h-full w-full rounded-full ${item.is_veg ? "bg-green-600" : "bg-red-600"}`} style={{ transform: "scale(0.5)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{item.name}</span>
            {item.is_must_try && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          </div>
          {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.description}</p>}
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{money(item.price)}</span>
        <div className="hidden items-center gap-1.5 sm:flex">
          <StatePill on={!!item.is_must_try} label="Must try" color="amber"
            onToggle={() => onToggle({ is_must_try: !item.is_must_try })} />
          <StatePill on={!!item.is_available} label={item.is_available ? "Visible" : "Hidden"}
            onToggle={() => onToggle({ is_available: !item.is_available })} />
        </div>
        <button onClick={onEdit} aria-label="Edit" className="rounded-md p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={onDelete} aria-label="Delete" className="hidden rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:block">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 pl-7 sm:hidden">
        <StatePill on={!!item.is_must_try} label="Must try" color="amber"
          onToggle={() => onToggle({ is_must_try: !item.is_must_try })} />
        <StatePill on={!!item.is_available} label={item.is_available ? "Visible" : "Hidden"}
          onToggle={() => onToggle({ is_available: !item.is_available })} />
      </div>
    </li>
  );
}

// ── Sortable category tab ──

function SortableCatTab({ cat, isActive, isHit, count, onClick }: {
  cat: GCategory; isActive: boolean; isHit: boolean; count: number; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Translate.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
    background: isActive ? "white" : isHit ? "#f0f7ff" : undefined,
    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,.08)" : undefined,
    borderRadius: 9999,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex shrink-0 items-center">
      <span {...attributes} {...listeners} aria-label={`Drag ${cat.name}`}
        className="cursor-grab touch-none pl-2 py-2 text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button onClick={onClick} aria-current={isActive ? "true" : undefined}
        className="inline-flex items-center gap-2 pr-3.5 py-2 text-sm"
        style={isActive ? { color: BLUE } : undefined}>
        <span className="whitespace-nowrap">{cat.name}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums
          ${isActive ? "bg-blue-50" : isHit ? "bg-white/70" : "bg-slate-100 text-slate-500"}`}>
          {count}
        </span>
      </button>
    </div>
  );
}

// ── Item editor slide-over ──

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
  item: GItem;
  categories: GCategory[];
  onSave: (patch: Partial<GItem>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    description: item.description ?? "",
    price: item.price,
    image_url: item.image_url ?? "",
    category_id: item.category_id ?? "",
    is_veg: item.is_veg !== false,
    is_must_try: !!item.is_must_try,
    is_available: !!item.is_available,
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    f.name !== item.name ||
    f.description !== (item.description ?? "") ||
    f.price !== item.price ||
    f.image_url !== (item.image_url ?? "") ||
    (f.category_id || null) !== (item.category_id ?? null) ||
    f.is_veg !== (item.is_veg !== false) ||
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
      category_id: f.category_id || null,
      is_veg: f.is_veg,
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
                <option value="">Uncategorized</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description" hint="one line is plenty">
            <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="What's in it, how it's served" className={inputCls + " resize-none"} />
          </Field>

          <div className="flex items-center gap-3 rounded-xl ring-1 ring-slate-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Veg / Non-veg</div>
              <div className="mt-0.5 text-xs text-slate-500">{f.is_veg ? "This item is vegetarian." : "This item is non-vegetarian."}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setF({ ...f, is_veg: true })}
                className={`h-7 w-7 rounded-md grid place-items-center ring-1 transition ${f.is_veg ? "ring-green-500 bg-green-50" : "ring-slate-200 bg-white"}`}
                aria-label="Veg" title="Veg">
                <span className={`block h-3.5 w-3.5 rounded-sm border-2 ${f.is_veg ? "border-green-600" : "border-slate-300"}`}>
                  <span className={`block h-full w-full rounded-full ${f.is_veg ? "bg-green-600" : ""}`} style={{ transform: "scale(0.5)" }} />
                </span>
              </button>
              <button onClick={() => setF({ ...f, is_veg: false })}
                className={`h-7 w-7 rounded-md grid place-items-center ring-1 transition ${!f.is_veg ? "ring-red-500 bg-red-50" : "ring-slate-200 bg-white"}`}
                aria-label="Non-veg" title="Non-veg">
                <span className={`block h-3.5 w-3.5 rounded-sm border-2 ${!f.is_veg ? "border-red-600" : "border-slate-300"}`}>
                  <span className={`block h-full w-full rounded-full ${!f.is_veg ? "bg-red-600" : ""}`} style={{ transform: "scale(0.5)" }} />
                </span>
              </button>
            </div>
          </div>

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
                  <span className={`inline-block h-3.5 w-3.5 rounded-sm border-2 shrink-0 ${f.is_veg ? "border-green-600" : "border-red-600"}`}>
                    <span className={`block h-full w-full rounded-full ${f.is_veg ? "bg-green-600" : "bg-red-600"}`} style={{ transform: "scale(0.5)" }} />
                  </span>
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

// ── Outlet assignment & sync panel ──

function OutletPanel({ menuId, outlets, assignments, lastChanged, onLoad }: {
  menuId: string;
  outlets: any[];
  assignments: Assignment[];
  lastChanged: string | null;
  onLoad: () => void;
}) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [overlapConfirm, setOverlapConfirm] = useState<{
    tenantId: string;
    outletName: string;
    matchedCats: string[];
    matchedItems: string[];
  } | null>(null);

  async function checkAndSync(tenantId: string) {
    const outlet = outlets.find((o) => o.id === tenantId);
    const alreadyLinked = assignments.some((a) => a.tenant_id === tenantId);

    // If already assigned+linked, just re-sync (no duplicate risk)
    if (alreadyLinked) {
      return doSync(tenantId);
    }

    // First sync to this outlet — check for name overlaps
    setSyncing(tenantId);
    const [{ data: gCats }, { data: gItems }, { data: outletCats }, { data: outletItems }] = await Promise.all([
      sb.from("global_menu_categories").select("name").eq("global_menu_id", menuId),
      sb.from("global_menu_items").select("name").eq("global_menu_id", menuId),
      supabase.from("menu_categories").select("name, global_category_id").eq("tenant_id", tenantId),
      supabase.from("menu_items").select("name, global_item_id").eq("tenant_id", tenantId),
    ]);
    setSyncing(null);

    const globalCatNames = ((gCats || []) as any[]).map((c: any) => c.name.trim().toLowerCase());
    const globalItemNames = ((gItems || []) as any[]).map((i: any) => i.name.trim().toLowerCase());

    // Find outlet categories/items that match by name but aren't linked yet
    const matchedCats = ((outletCats || []) as any[])
      .filter((c: any) => !c.global_category_id && globalCatNames.includes(c.name.trim().toLowerCase()))
      .map((c: any) => c.name);
    const matchedItems = ((outletItems || []) as any[])
      .filter((i: any) => !i.global_item_id && globalItemNames.includes(i.name.trim().toLowerCase()))
      .map((i: any) => i.name);

    if (matchedCats.length > 0 || matchedItems.length > 0) {
      setOverlapConfirm({ tenantId, outletName: outlet?.name || "Outlet", matchedCats, matchedItems });
      return;
    }

    // No overlaps — sync directly
    doSync(tenantId);
  }

  async function doSync(tenantId: string) {
    setSyncing(tenantId);
    const existing = assignments.find((a) => a.tenant_id === tenantId);
    if (!existing) {
      const { error } = await sb.from("global_menu_assignments").insert({
        global_menu_id: menuId, tenant_id: tenantId,
      });
      if (error) { setSyncing(null); return toast.error(error.message); }
    }
    const { data, error } = await sb.rpc("sync_global_menu_to_outlet", {
      p_global_menu_id: menuId, p_tenant_id: tenantId,
    });
    setSyncing(null);
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(
      `Synced: ${r.categories_synced} categories, ${r.items_synced} items` +
        (r.items_skipped > 0 ? ` (${r.items_skipped} overridden items kept)` : ""),
    );
    onLoad();
  }

  async function removeOutlet(tenantId: string) {
    const existing = assignments.find((a) => a.tenant_id === tenantId);
    if (!existing) return;

    // Get global IDs for this menu to find linked outlet rows
    const [{ data: gCats }, { data: gItems }] = await Promise.all([
      sb.from("global_menu_categories").select("id").eq("global_menu_id", menuId),
      sb.from("global_menu_items").select("id").eq("global_menu_id", menuId),
    ]);
    const catIds = ((gCats || []) as any[]).map((c: any) => c.id);
    const itemIds = ((gItems || []) as any[]).map((i: any) => i.id);

    // Delete synced items then categories from the outlet
    if (itemIds.length) {
      await supabase.from("menu_items")
        .delete()
        .eq("tenant_id", tenantId)
        .in("global_item_id", itemIds);
    }
    if (catIds.length) {
      await supabase.from("menu_categories")
        .delete()
        .eq("tenant_id", tenantId)
        .in("global_category_id", catIds);
    }

    // Remove the assignment
    const { error } = await sb.from("global_menu_assignments").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success("Outlet removed and synced items deleted");
    onLoad();
  }

  async function syncAll() {
    for (const a of assignments) {
      await doSync(a.tenant_id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{assignments.length} of {outlets.length} outlets synced</p>
        {assignments.length > 0 && (
          <button onClick={syncAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Sync all
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 bg-white">
        {outlets.map((o) => {
          const assigned = assignments.find((a) => a.tenant_id === o.id);
          const isSyncing = syncing === o.id;
          const needsSync = assigned && lastChanged && assigned.last_synced_at && new Date(lastChanged) > new Date(assigned.last_synced_at);
          return (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-5">
              <div className="flex items-center gap-2 min-w-0 sm:gap-3">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{o.name}</div>
                  <div className="text-xs text-slate-500">
                    {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                    {assigned?.last_synced_at && <> · Synced {new Date(assigned.last_synced_at).toLocaleDateString()}</>}
                  </div>
                  {needsSync && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Updates available
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {assigned && (
                  <button onClick={() => removeOutlet(o.id)} disabled={isSyncing}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-40">
                    Remove
                  </button>
                )}
                <button onClick={() => checkAndSync(o.id)} disabled={isSyncing}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${assigned ? needsSync ? "border border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border border-slate-200 text-slate-700 hover:bg-slate-50" : "text-white"}`}
                  style={!assigned ? { background: BLUE } : undefined}>
                  {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync to outlet
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overlap confirmation */}
      {overlapConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={() => setOverlapConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold">Items already exist in {overlapConfirm.outletName}</h3>
            <p className="mt-2 text-sm text-slate-600">
              The following already exist in this outlet's menu. They will be replaced with the global menu version — no duplicates will be created.
            </p>

            {overlapConfirm.matchedCats.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Categories</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {overlapConfirm.matchedCats.map((name) => (
                    <span key={name} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">{name}</span>
                  ))}
                </div>
              </div>
            )}

            {overlapConfirm.matchedItems.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Items</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {overlapConfirm.matchedItems.slice(0, 15).map((name) => (
                    <span key={name} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">{name}</span>
                  ))}
                  {overlapConfirm.matchedItems.length > 15 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">+{overlapConfirm.matchedItems.length - 15} more</span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOverlapConfirm(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => { const id = overlapConfirm.tenantId; setOverlapConfirm(null); doSync(id); }}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: BLUE }}>
                Replace & sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MAIN: GlobalMenuManager
// ══════════════════════════════════════════════

type OutletMenuInfo = {
  tenantId: string;
  name: string;
  city: string | null;
  state: string | null;
  categoryCount: number;
  itemCount: number;
};

export function GlobalMenuManager({ outlets, organization }: {
  outlets: any[];
  organization: Organization | undefined;
}) {
  const orgId = organization?.id;

  // Menu list
  const [menus, setMenus] = useState<GlobalMenu[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  // Create flow
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"pick" | "import" | "blank">("pick");
  const [newName, setNewName] = useState("");
  const [importing, setImporting] = useState(false);

  // Import: outlet menu data
  const [outletMenus, setOutletMenus] = useState<OutletMenuInfo[]>([]);
  const [outletMenusLoading, setOutletMenusLoading] = useState(false);

  // Active menu editor
  const [activeMenu, setActiveMenu] = useState<GlobalMenu | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  async function loadMenus() {
    if (!orgId) return;
    setMenuLoading(true);
    const { data: menuRows } = await sb.from("global_menus")
      .select("*").eq("organization_id", orgId).order("created_at");
    const list = (menuRows || []) as GlobalMenu[];

    if (list.length) {
      const ids = list.map((m) => m.id);
      const [{ data: cats }, { data: items }, { data: assigns }] = await Promise.all([
        sb.from("global_menu_categories").select("id, global_menu_id").in("global_menu_id", ids),
        sb.from("global_menu_items").select("id, global_menu_id").in("global_menu_id", ids),
        sb.from("global_menu_assignments").select("global_menu_id, tenant_id").in("global_menu_id", ids),
      ]);
      for (const m of list) {
        m.categoryCount = ((cats || []) as any[]).filter((c) => c.global_menu_id === m.id).length;
        m.itemCount = ((items || []) as any[]).filter((i) => i.global_menu_id === m.id).length;
        m.assignedOutlets = ((assigns || []) as any[]).filter((a) => a.global_menu_id === m.id).map((a) => a.tenant_id);
      }
    }

    setMenus(list);
    setMenuLoading(false);
    if (list.length && !activeMenu) setActiveMenu(list[0]);
  }

  useEffect(() => { loadMenus(); }, [orgId]);

  async function loadOutletMenus() {
    if (!outlets.length) return;
    setOutletMenusLoading(true);
    const ids = outlets.map((o) => o.id);
    const [{ data: catRows }, { data: itemRows }] = await Promise.all([
      supabase.from("menu_categories").select("id, tenant_id").in("tenant_id", ids),
      supabase.from("menu_items").select("id, tenant_id").in("tenant_id", ids),
    ]);
    const info: OutletMenuInfo[] = outlets.map((o) => ({
      tenantId: o.id,
      name: o.name,
      city: o.city,
      state: o.state,
      categoryCount: ((catRows || []) as any[]).filter((c) => c.tenant_id === o.id).length,
      itemCount: ((itemRows || []) as any[]).filter((i) => i.tenant_id === o.id).length,
    }));
    setOutletMenus(info);
    setOutletMenusLoading(false);
  }

  function openCreate() {
    setShowCreate(true);
    setCreateMode("pick");
    setNewName("");
  }

  async function createBlank() {
    if (!orgId || !newName.trim()) return;
    setImporting(true);
    const { data, error } = await sb.from("global_menus")
      .insert({ organization_id: orgId, name: newName.trim(), description: null })
      .select().single();
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success("Global menu created");
    setShowCreate(false); setNewName("");
    await loadMenus();
    if (data) setActiveMenu(data as GlobalMenu);
  }

  async function importFromOutlet(outlet: OutletMenuInfo) {
    if (!orgId) return;
    setImporting(true);
    const menuName = newName.trim() || `${outlet.name} Menu`;

    const { data: created, error } = await sb.from("global_menus")
      .insert({ organization_id: orgId, name: menuName, description: `Imported from ${outlet.name}` })
      .select().single();
    if (error || !created) { setImporting(false); return toast.error(error?.message || "Could not create menu"); }

    const [{ data: srcCats }, { data: srcItems }] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("tenant_id", outlet.tenantId).order("sort_order"),
      supabase.from("menu_items").select("*").eq("tenant_id", outlet.tenantId).order("sort_order"),
    ]);

    const catMap = new Map<string, string>();
    for (const c of (srcCats || []) as any[]) {
      const { data: newCat } = await sb.from("global_menu_categories")
        .insert({ global_menu_id: created.id, name: c.name, image_url: c.image_url, sort_order: c.sort_order })
        .select("id").single();
      if (newCat) catMap.set(c.id, newCat.id);
    }

    for (const item of (srcItems || []) as any[]) {
      await sb.from("global_menu_items").insert({
        global_menu_id: created.id,
        category_id: item.category_id ? catMap.get(item.category_id) || null : null,
        name: item.name,
        description: item.description,
        price: item.price,
        image_url: item.image_url,
        is_veg: item.is_veg ?? true,
        is_must_try: item.is_must_try ?? false,
        is_available: item.is_available ?? true,
        sort_order: item.sort_order ?? 0,
      });
    }

    setImporting(false);
    toast.success(`Imported ${(srcCats || []).length} categories and ${(srcItems || []).length} items from ${outlet.name}`);
    setShowCreate(false); setNewName("");
    await loadMenus();
    setActiveMenu(created as GlobalMenu);
  }

  function deleteMenu(m: GlobalMenu) {
    const outletCount = m.assignedOutlets?.length ?? 0;
    const outletWarning = outletCount > 0
      ? ` All synced items will be removed from ${outletCount} outlet${outletCount > 1 ? "s" : ""}.`
      : "";
    setConfirmState({
      title: `Delete "${m.name}"?`,
      body: `This removes all categories and items in this global menu.${outletWarning} This can't be undone.`,
      run: async () => {
        const { error } = await sb.from("global_menus").delete().eq("id", m.id);
        if (error) { toast.error(error.message); return; }
        toast.success(`"${m.name}" deleted` + (outletCount > 0 ? ` and removed from ${outletCount} outlet${outletCount > 1 ? "s" : ""}` : ""));
        if (activeMenu?.id === m.id) setActiveMenu(null);
        loadMenus();
      },
    });
  }

  if (!orgId) {
    return (
      <div className="mt-4 text-center text-sm text-slate-500">
        Global menu management is available for multi-outlet businesses.
      </div>
    );
  }

  if (menuLoading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 flex gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-slate-200/70" />)}
        </div>
        <div className="mt-4 h-80 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-slate-50 text-slate-900 rounded-xl">
      {/* Menu selector bar */}
      <header className="border-b border-slate-200 bg-white rounded-t-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
          <div className="mr-auto">
            <p className="text-sm text-slate-500">
              {menus.length} global menu{menus.length !== 1 ? "s" : ""}
              {activeMenu && <> · Editing <strong>{activeMenu.name}</strong></>}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {menus.length > 0 && (
              <select
                value={activeMenu?.id || ""}
                onChange={(e) => {
                  const m = menus.find((x) => x.id === e.target.value);
                  setActiveMenu(m || null);
                }}
                className={inputCls + " min-w-0 flex-1 sm:w-48 sm:flex-none"}
              >
                <option value="" disabled>Select a menu</option>
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.itemCount ?? 0} items)</option>
                ))}
              </select>
            )}
            {activeMenu && (
              <button onClick={() => deleteMenu(activeMenu)} title="Delete menu"
                className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={openCreate}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: BLUE }}>
              <Plus className="h-4 w-4" /> New menu
            </button>
          </div>
        </div>
      </header>

      {/* ── Create / Import modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={() => !importing && setShowCreate(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl">

            {/* Step 1: pick method */}
            {createMode === "pick" && (
              <div className="p-6">
                <h3 className="text-lg font-semibold">Create Global Menu</h3>
                <p className="mt-1 text-sm text-slate-500">Choose how to start your master menu.</p>
                <div className="mt-5 grid gap-3">
                  <button onClick={() => { setCreateMode("import"); loadOutletMenus(); }}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 px-4 py-4 text-left hover:bg-slate-50 transition">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50">
                      <Import className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Import from an outlet</div>
                      <div className="mt-0.5 text-sm text-slate-500">Copy an existing outlet's menu as your starting point</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                  <button onClick={() => setCreateMode("blank")}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 px-4 py-4 text-left hover:bg-slate-50 transition">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100">
                      <Plus className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Start from scratch</div>
                      <div className="mt-0.5 text-sm text-slate-500">Create an empty menu and add categories & items</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 2a: blank menu — just name */}
            {createMode === "blank" && (
              <div className="p-6">
                <h3 className="text-lg font-semibold">New blank menu</h3>
                <p className="mt-1 text-sm text-slate-500">Give your global menu a name.</p>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createBlank()}
                  placeholder="e.g. Main Menu" className={inputCls + " mt-4"} />
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setCreateMode("pick")}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Back
                  </button>
                  <button onClick={createBlank} disabled={!newName.trim() || importing}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: BLUE }}>
                    {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Step 2b: import — pick an outlet */}
            {createMode === "import" && (
              <div className="p-6">
                <h3 className="text-lg font-semibold">Import from outlet</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Select an outlet whose menu you want to use as the global template.
                  You can edit items after importing.
                </p>

                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Global menu name (optional — defaults to outlet name)"
                  className={inputCls + " mt-4"} />

                <div className="mt-4 max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                  {outletMenusLoading ? (
                    <div className="px-4 py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                      <p className="mt-2 text-sm text-slate-500">Loading outlet menus...</p>
                    </div>
                  ) : outletMenus.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">No outlets found.</div>
                  ) : (
                    outletMenus.map((o) => (
                      <button key={o.tenantId}
                        onClick={() => !importing && importFromOutlet(o)}
                        disabled={importing || o.itemCount === 0}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100">
                          <Building2 className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{o.name}</div>
                          <div className="text-xs text-slate-500">
                            {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">{o.itemCount} items</div>
                          <div className="text-xs text-slate-400">{o.categoryCount} categories</div>
                        </div>
                        {o.itemCount > 0 ? (
                          <Import className="h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <span className="text-[10px] text-slate-400 shrink-0">Empty</span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {importing && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing menu...
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setCreateMode("pick")} disabled={importing}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    Back
                  </button>
                  <button onClick={() => setShowCreate(false)} disabled={importing}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!activeMenu && !showCreate ? (
        <div className="px-5 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100">
            <UtensilsCrossed className="h-6 w-6 text-slate-400" />
          </div>
          <p className="mt-4 font-medium">No global menus yet</p>
          <p className="mt-1 text-sm text-slate-500">Import a menu from one of your outlets or create one from scratch.</p>
          <div className="mt-5 flex justify-center gap-3">
            <button onClick={() => { openCreate(); setCreateMode("import"); loadOutletMenus(); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: BLUE }}>
              <Import className="h-4 w-4" /> Import from outlet
            </button>
            <button onClick={() => { openCreate(); setCreateMode("blank"); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Start from scratch
            </button>
          </div>
        </div>
      ) : activeMenu ? (
        <MenuEditor
          key={activeMenu.id}
          menu={activeMenu}
          outlets={outlets}
          onUpdated={loadMenus}
        />
      ) : null}

      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MENU EDITOR — looks like app.menu.tsx
// ══════════════════════════════════════════════

function MenuEditor({ menu, outlets, onUpdated }: {
  menu: GlobalMenu;
  outlets: any[];
  onUpdated: () => void;
}) {
  const [cats, setCats] = useState<GCategory[]>([]);
  const [items, setItems] = useState<GItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
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
  const [editorTab, setEditorTab] = useState<"items" | "outlets">("items");
  const [lastChanged, setLastChanged] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [{ data: c }, { data: i }, { data: a }] = await Promise.all([
      sb.from("global_menu_categories").select("*").eq("global_menu_id", menu.id).order("sort_order"),
      sb.from("global_menu_items").select("*").eq("global_menu_id", menu.id).order("sort_order"),
      sb.from("global_menu_assignments").select("*").eq("global_menu_id", menu.id),
    ]);
    const categories = (c || []) as GCategory[];
    const itemList = (i || []) as GItem[];
    let assignList = (a || []) as Assignment[];

    if (categories.length === 0 && itemList.length === 0 && assignList.length > 0) {
      await sb.from("global_menu_assignments").delete().eq("global_menu_id", menu.id);
      assignList = [];
    }

    const { data: menuRow } = await sb.from("global_menus").select("updated_at").eq("id", menu.id).single();
    setLastChanged(menuRow?.updated_at ?? null);

    setCats(categories);
    setItems(itemList);
    setAssignments(assignList);
    setActiveId((prev) => (prev && categories.some((x) => x.id === prev) ? prev : categories[0]?.id ?? null));
    setLoading(false);
  }

  useEffect(() => { load(); }, [menu.id]);

  const active = cats.find((c) => c.id === activeId) ?? null;
  const countFor = (id: string) => items.filter((i) => i.category_id === id).length;
  const totals = useMemo(() => ({
    items: items.length,
    hidden: items.filter((i) => !i.is_available).length,
  }), [items]);

  async function cleanupIfEmpty() {
    const [{ data: rc }, { data: ri }] = await Promise.all([
      sb.from("global_menu_categories").select("id").eq("global_menu_id", menu.id).limit(1),
      sb.from("global_menu_items").select("id").eq("global_menu_id", menu.id).limit(1),
    ]);
    if (!(rc?.length) && !(ri?.length)) {
      await sb.from("global_menu_assignments").delete().eq("global_menu_id", menu.id);
    }
  }

  async function touchMenu() {
    const now = new Date().toISOString();
    await sb.from("global_menus").update({ updated_at: now }).eq("id", menu.id);
    setLastChanged(now);
  }

  useEffect(() => { setRenaming(false); }, [activeId]);

  // search
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

  // writes
  async function addCat() {
    const name = newCat.trim();
    if (!name) return;
    setBusy(true);
    const { data, error } = await sb.from("global_menu_categories")
      .insert({ name, global_menu_id: menu.id, sort_order: cats.length })
      .select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewCat(""); setAddingCat(false);
    await touchMenu(); await load(); onUpdated();
    if (data?.id) setActiveId(data.id);
    toast.success(`Added ${name}`);
  }

  function startRename(c: GCategory) { setCatName(c.name); setRenaming(true); }

  async function saveRename() {
    if (!active) return;
    const name = catName.trim();
    if (!name) return toast.error("Give the category a name");
    if (name === active.name) { setRenaming(false); return; }
    setBusy(true);
    const { error } = await sb.from("global_menu_categories").update({ name }).eq("id", active.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setRenaming(false);
    await touchMenu(); await load(); onUpdated();
    toast.success(`Renamed to ${name}`);
  }

  function askDelCat(c: GCategory) {
    const n = countFor(c.id);
    const outletCount = assignments.length;
    const outletWarning = outletCount > 0
      ? ` This will also remove it from ${outletCount} synced outlet${outletCount > 1 ? "s" : ""}.`
      : "";
    setConfirmState({
      title: `Delete ${c.name}?`,
      body: (n ? `This removes ${n} item${n > 1 ? "s" : ""} in it.` : "") + outletWarning + " This can't be undone.",
      run: async () => {
        const { error } = await sb.from("global_menu_categories").delete().eq("id", c.id);
        if (error) { toast.error(error.message); return; }
        toast.success(`Deleted ${c.name}` + (outletCount > 0 ? ` from global menu and ${outletCount} outlet${outletCount > 1 ? "s" : ""}` : ""));
        await touchMenu(); await cleanupIfEmpty();
        await load(); onUpdated();
      },
    });
  }

  function askDelItem(item: GItem) {
    const outletCount = assignments.length;
    const outletWarning = outletCount > 0
      ? ` This will also remove it from ${outletCount} synced outlet${outletCount > 1 ? "s" : ""}.`
      : "";
    setConfirmState({
      title: `Delete ${item.name}?`,
      body: "It will be removed from the global menu." + outletWarning + " This can't be undone.",
      run: async () => {
        const before = items;
        setItems((xs) => xs.filter((i) => i.id !== item.id));
        const { error } = await sb.from("global_menu_items").delete().eq("id", item.id);
        if (error) { setItems(before); toast.error(error.message); return; }
        toast.success(`Deleted ${item.name}` + (outletCount > 0 ? ` from global menu and ${outletCount} outlet${outletCount > 1 ? "s" : ""}` : ""));
        await touchMenu(); await cleanupIfEmpty();
        await load(); onUpdated();
      },
    });
  }

  async function addItem() {
    const name = draft.name.trim();
    if (!name || !activeId) return;
    setBusy(true);
    const { error } = await sb.from("global_menu_items").insert({
      global_menu_id: menu.id,
      category_id: activeId,
      name,
      price: Number(draft.price) || 0,
      is_available: true,
      sort_order: countFor(activeId),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft({ name: "", price: "" });
    await touchMenu(); load(); onUpdated();
  }

  async function updateItem(id: string, patch: Partial<GItem>) {
    const before = items;
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await sb.from("global_menu_items").update(patch).eq("id", id);
    if (error) { setItems(before); toast.error(error.message); return false; }
    await touchMenu(); onUpdated();
    return true;
  }

  const editingItem = items.find((i) => i.id === editing) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  async function onCatDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = cats.findIndex((c) => c.id === active.id);
    const newIdx = cats.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(cats, oldIdx, newIdx);
    setCats(reordered);
    await Promise.all(reordered.map((c, i) =>
      sb.from("global_menu_categories").update({ sort_order: i }).eq("id", c.id)
    ));
    await touchMenu();
  }

  async function onItemDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const catItems = items.filter((i) => i.category_id === activeId);
    const oldIdx = catItems.findIndex((i) => i.id === active.id);
    const newIdx = catItems.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(catItems, oldIdx, newIdx);
    const otherItems = items.filter((i) => i.category_id !== activeId);
    setItems([...otherItems, ...reordered.map((item, i) => ({ ...item, sort_order: i }))]);
    await Promise.all(reordered.map((item, i) =>
      sb.from("global_menu_items").update({ sort_order: i }).eq("id", item.id)
    ));
    await touchMenu();
  }

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

  return (
    <>
      {/* Tab bar: Menu Items | Share to Outlets */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-0 px-5 sm:px-8">
          <button onClick={() => setEditorTab("items")}
            className={`relative px-3 py-3.5 text-sm font-medium transition-colors sm:px-5 ${editorTab === "items" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5">
              <UtensilsCrossed className="h-4 w-4" />
              Menu Items
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${editorTab === "items" ? "bg-blue-50" : "bg-slate-100 text-slate-500"}`}>{totals.items}</span>
            </span>
            {editorTab === "items" && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: BLUE }} />}
          </button>
          <button onClick={() => setEditorTab("outlets")}
            className={`relative px-3 py-3.5 text-sm font-medium transition-colors sm:px-5 ${editorTab === "outlets" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              Share to Outlets
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${editorTab === "outlets" ? "bg-blue-50" : "bg-slate-100 text-slate-500"}`}>{assignments.length}</span>
            </span>
            {editorTab === "outlets" && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: BLUE }} />}
          </button>

          {editorTab === "items" && (
            <div className="relative w-full py-2 sm:ml-auto sm:w-auto sm:py-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="Search categories and items"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 sm:w-64" />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Share to Outlets tab ── */}
      {editorTab === "outlets" && (
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
          <OutletPanel menuId={menu.id} outlets={outlets} assignments={assignments} lastChanged={lastChanged} onLoad={() => { load(true); onUpdated(); }} />
        </div>
      )}

      {/* ── Menu Items tab ── */}
      {editorTab === "items" && <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        {/* Categories — draggable horizontal strip */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCatDragEnd}>
          <SortableContext items={cats.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            <nav aria-label="Menu categories"
              className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {cats.map((c) => (
                <SortableCatTab key={c.id} cat={c}
                  isActive={!q && c.id === activeId}
                  isHit={!!q && c.name.toLowerCase().includes(q)}
                  count={countFor(c.id)}
                  onClick={() => openCategory(c.id)} />
              ))}

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
          </SortableContext>
        </DndContext>

        {q ? (
          <main className="mt-3 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
              <h2 className="text-base font-semibold">Results for "{query.trim()}"</h2>
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
                    <span className="text-xs text-slate-400">{g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
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
          <main className="mt-3 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {!active ? (
              <div className="px-5 py-16 text-center">
                <p className="font-medium">This menu is empty</p>
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
                      <label htmlFor="gcat-name" className="sr-only">Category name</label>
                      <input id="gcat-name" autoFocus value={catName}
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
                    <p className="mt-1 text-sm text-slate-500">Add your first item below — photos and descriptions can come later.</p>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDragEnd}>
                    <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                      <ul className="divide-y divide-slate-100">
                        {shown.map((item) => (
                          <ItemRow key={item.id} item={item}
                            onToggle={(patch) => updateItem(item.id, patch)}
                            onEdit={() => setEditing(item.id)}
                            onDelete={() => askDelItem(item)} />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
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
      </div>}

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
    </>
  );
}
