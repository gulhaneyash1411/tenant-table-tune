// Icons a plan can show next to its name. The key is what gets stored on the plan.
import { Rocket, TrendingUp, Crown, Building2, Store, Zap, Star, Utensils } from "lucide-react";

export const PLAN_ICON_OPTIONS = [
  { key: "rocket", label: "Rocket", Icon: Rocket },
  { key: "trending", label: "Growth", Icon: TrendingUp },
  { key: "crown", label: "Crown", Icon: Crown },
  { key: "building", label: "Building", Icon: Building2 },
  { key: "store", label: "Store", Icon: Store },
  { key: "zap", label: "Zap", Icon: Zap },
  { key: "star", label: "Star", Icon: Star },
  { key: "utensils", label: "Dining", Icon: Utensils },
];

/** The plan's icon, or nothing when none is chosen. */
export function PlanIconGlyph({ name, className }: { name?: string | null; className?: string }) {
  const found = PLAN_ICON_OPTIONS.find((o) => o.key === name);
  if (!found) return null;
  const { Icon } = found;
  return <Icon className={className} aria-hidden="true" />;
}
