// Feature toggles for a subscription plan, stored in subscription_plans.features.
// The admin plan form and the owner portal both read from here.

export const FEATURE_GROUPS = [
  { title: "Service", items: [
    { key: "dashboards", label: "Dashboards" },
    { key: "live_orders", label: "Live orders" },
    { key: "kitchen_display", label: "Kitchen display" },
    { key: "order_history", label: "Order history" },
  ] },
  { title: "Menu & tables", items: [
    { key: "menu", label: "Menu" },
    { key: "tables_qr", label: "Tables & QR" },
    { key: "floor_plan", label: "Floor plan" },
    { key: "bookings", label: "Bookings" },
  ] },
  { title: "Customers", items: [
    { key: "customers", label: "Customers" },
    { key: "reviews", label: "Reviews" },
    { key: "whatsapp", label: "WhatsApp" },
  ] },
  { title: "Money", items: [
    { key: "revenue", label: "Revenue" },
    { key: "expenses", label: "Expenses" },
    { key: "analytics", label: "Analytics" },
  ] },
  { title: "Business", items: [
    { key: "staff_management", label: "Staff management" },
    { key: "shop", label: "Shop" },
    { key: "subscription", label: "Subscription" },
    { key: "settings_outlets", label: "Settings: Outlets" },
    { key: "settings_lock_pin", label: "Settings: Lock PIN" },
    { key: "settings_kitchen_account", label: "Settings: Kitchen account" },
    { key: "manager_profile", label: "Manager profile" },
  ] },
];

export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);

export const ALL_FEATURE_KEYS = Object.keys(FEATURE_LABEL);

// Included in every plan, whatever the plan's switches say.
export const ALWAYS_ON_FEATURES = ["dashboards"];

/** Anything carrying a plan's feature switches — the context's `plan`, or a plan row. */
export type PlanLike = { features?: Record<string, boolean> | null } | null | undefined;

/**
 * Whether a *plan's feature map* includes a feature.
 *
 * This takes the raw `features` object, so it cannot tell "no plan at all" from
 * "plan whose features are `{}`" — both arrive here as an empty object and both
 * return true. Use it only where a plan is known to exist (e.g. the admin plan
 * form previewing a plan's switches). Everywhere the tenant's current plan may
 * be null, use `planIncludes` below.
 *
 * - No feature key given: always allowed (the page isn't plan-gated).
 * - Plan with no feature config at all (`{}`, e.g. older plans or a free trial):
 *   everything stays open, as before plan features existed.
 * - Otherwise only features switched on for the plan are allowed.
 */
export function planAllows(features: Record<string, boolean> | null | undefined, key?: string | null): boolean {
  if (!key) return true;
  if (ALWAYS_ON_FEATURES.includes(key)) return true;
  const f = features ?? {};
  if (Object.keys(f).length === 0) return true;
  return f[key] === true;
}

/**
 * Whether the tenant's current plan includes a feature.
 *
 * - No feature key given: always allowed (the page isn't plan-gated).
 * - No plan at all — paid plan expired and the free plan is deactivated: nothing
 *   plan-gated is allowed. This is the case `planAllows` alone gets wrong.
 * - Otherwise defers to the plan's own feature switches.
 */
export function planIncludes(plan: PlanLike, key?: string | null): boolean {
  if (!key) return true;
  if (ALWAYS_ON_FEATURES.includes(key)) return true;
  if (!plan) return false;
  return planAllows(plan.features, key);
}