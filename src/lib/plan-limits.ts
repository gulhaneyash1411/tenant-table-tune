// Plan limits that count existing rows before one more is added.
// Enforced in the app only; see the row-level security note in the plan docs.
import { supabase } from "@/integrations/supabase/client";

export type PlanLimits = {
  name?: string;
  max_tables?: number | null;
  max_orders_month?: number | null;
  max_menu_items?: number | null;
  max_staff?: number | null;
} | null | undefined;

export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Returns a message when adding one more row would go over the plan's limit,
 * or null when it's allowed. A blank limit (null) is unlimited. A failed count
 * allows the add rather than blocking the owner on a read error.
 */
export async function planLimitError(opts: {
  plan: PlanLimits;
  limit: "max_orders_month" | "max_menu_items" | "max_staff";
  tenantId: string;
  table: "orders" | "menu_items" | "staff_members";
  label: string;
  since?: Date;
}): Promise<string | null> {
  const max = opts.plan?.[opts.limit];
  if (max == null) return null;
  let q = (supabase as any).from(opts.table).select("id", { count: "exact", head: true }).eq("tenant_id", opts.tenantId);
  if (opts.since) q = q.gte("created_at", opts.since.toISOString());
  const { count, error } = await q;
  if (error) return null;
  if ((count ?? 0) >= max) return `Your plan allows ${max} ${opts.label}. Upgrade to add more.`;
  return null;
}
