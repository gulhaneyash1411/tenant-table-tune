import { supabase } from "@/integrations/supabase/client";

/**
 * Selected-outlet plumbing for multi-outlet owners.
 *
 * Every outlet is a row in `tenants`. The outlet the owner is working in is
 * remembered in localStorage and sent to PostgREST as the `x-outlet-id` header,
 * which the SQL function current_tenant_id() reads. The database only honours
 * it when the caller owns (or holds a role on) that outlet, so the header can
 * never reach another account's data — it just picks among the caller's own.
 */

export type BusinessType = "SINGLE_OUTLET" | "MULTI_OUTLET";
export type OutletStatus = "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

/** Columns added by 20261005120000_organizations_and_outlets.sql (not yet in the generated types). */
export type OutletFields = { organization_id: string | null; outlet_status: OutletStatus };

const STORAGE_KEY = "plateos.selectedOutlet";
const HEADER = "x-outlet-id";

export function getSelectedOutletId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Applies (or clears) the header on all subsequent PostgREST requests. */
export function applyOutletHeader(outletId: string | null) {
  try {
    // PostgrestClient keeps its default headers in a plain object.
    const headers = (supabase as any).rest?.headers as Record<string, string> | undefined;
    if (!headers) return;
    if (outletId) headers[HEADER] = outletId;
    else delete headers[HEADER];
  } catch {
    /* header is an optimisation of "which outlet"; the DB falls back to the oldest owned outlet */
  }
}

export function setSelectedOutletId(outletId: string | null) {
  try {
    if (outletId) localStorage.setItem(STORAGE_KEY, outletId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — selection just won't persist across reloads */
  }
  applyOutletHeader(outletId);
}

/**
 * The tenant (outlet) the signed-in owner is currently working in. Replaces the
 * scattered `.eq("owner_id", uid).single()` lookups, which break once an owner
 * has more than one outlet.
 */
export async function fetchCurrentOutlet<T = any>(userId: string, columns = "*"): Promise<T | null> {
  // RLS decides what the caller can read: their own outlets, or — for an Outlet
  // Manager — the outlets they were assigned. So no owner filter on the selected id.
  const selected = getSelectedOutletId();
  if (selected) {
    const { data } = await (supabase as any).from("tenants").select(columns).eq("id", selected).maybeSingle();
    if (data) return data as T;
  }
  const owned = await (supabase as any)
    .from("tenants").select(columns).eq("owner_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (owned.data) return owned.data as T;
  const { data } = await (supabase as any)
    .from("tenants").select(columns).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data as T) ?? null;
}
