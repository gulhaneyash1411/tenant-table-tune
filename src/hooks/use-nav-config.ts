// src/hooks/use-nav-config.ts
//
// Resolves the registry in src/config/nav-registry.ts against the platform
// defaults and this restaurant's overrides, and hands back the sections the
// owner is actually allowed to see.
//
// Used by the owner portal (/app). The admin console reads the raw tables
// directly, because it needs to show the un-resolved state.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TENANT_SECTIONS, type NavItem, type NavSection } from "@/config/nav-registry";

export type NavRow = { key: string; enabled: boolean | null; label: string | null };
type RowMap = Record<string, NavRow>;

const toMap = (rows: NavRow[] | null): RowMap =>
  (rows ?? []).reduce<RowMap>((acc, r) => { acc[r.key] = r; return acc; }, {});

export type NavConfig = {
  loading: boolean;
  /** Sections + items the owner may see, with any label overrides applied. */
  sections: NavSection[];
  /** True if this section/item key is switched on for this restaurant. */
  isVisible: (key: string) => boolean;
  /** Resolved label for a key (falls back to the registry label). */
  labelFor: (key: string, fallback: string) => string;
  refresh: () => void;
};

export function useNavConfig(tenantId?: string | null): NavConfig {
  const [defaults, setDefaults] = useState<RowMap>({});
  const [overrides, setOverrides] = useState<RowMap>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const defaultsQ = supabase.from("nav_defaults").select("key, enabled, label");
      const overridesQ = tenantId
        ? supabase.from("tenant_nav_overrides").select("key, enabled, label").eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as NavRow[] });

      const [d, o] = await Promise.all([defaultsQ, overridesQ as any]);
      if (cancelled) return;
      // On error we fail OPEN: a broken settings read must not black out the
      // owner's whole sidebar.
      setDefaults(toMap((d as any).data));
      setOverrides(toMap((o as any).data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, tick]);

  // Live updates: flipping a switch in the admin console reaches open portals.
  useEffect(() => {
    const channel = supabase
      .channel(`nav-config-${tenantId ?? "global"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nav_defaults" }, refresh)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenant_nav_overrides",
          ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
        },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, refresh]);

  const lockedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sec of TENANT_SECTIONS) {
      if (sec.locked) s.add(sec.key);
      for (const it of sec.items) if (it.locked) s.add(it.key);
    }
    return s;
  }, []);

  const isVisible = useCallback(
    (key: string) => {
      if (lockedKeys.has(key)) return true;
      const o = overrides[key]?.enabled;
      if (o !== undefined && o !== null) return o;
      const d = defaults[key]?.enabled;
      if (d !== undefined && d !== null) return d;
      return true; // nothing stored → visible
    },
    [defaults, overrides, lockedKeys],
  );

  const labelFor = useCallback(
    (key: string, fallback: string) =>
      overrides[key]?.label?.trim() || defaults[key]?.label?.trim() || fallback,
    [defaults, overrides],
  );

  const sections = useMemo(() => {
    const out: NavSection[] = [];
    for (const section of TENANT_SECTIONS) {
      if (!isVisible(section.key)) continue;
      const items: NavItem[] = section.items
        .filter((it) => isVisible(it.key))
        .map((it) => ({ ...it, label: labelFor(it.key, it.label) }));
      // An empty group is just a stray heading.
      if (items.length === 0) continue;
      out.push({ ...section, label: labelFor(section.key, section.label), items });
    }
    return out;
  }, [isVisible, labelFor]);

  return { loading, sections, isVisible, labelFor, refresh };
}