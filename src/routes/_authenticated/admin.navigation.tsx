// src/routes/_authenticated/admin.navigation.tsx
//
// Super-admin control panel for what restaurant owners see in /app.
//
// Two scopes:
//   Platform defaults  -> nav_defaults          (applies to every restaurant)
//   One restaurant     -> tenant_nav_overrides  (an exception to the default)
//
// In restaurant scope a key can be On, Off, or Inherit. Inherit deletes the
// override row, so later changes to the platform default flow through again.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { navDb, type NavRow } from "@/lib/nav-db";
import { TENANT_SECTIONS, ALL_KEYS } from "@/config/nav-registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Lock, RotateCcw, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/navigation")({
  component: NavigationControls,
});

const GLOBAL = "__global__";

type Entry = { enabled: boolean | null; label: string | null };
type Draft = Record<string, Entry>;
type TenantRow = { id: string; name: string | null; city: string | null };

const EMPTY: Entry = { enabled: null, label: null };
const entryOf = (d: Draft, key: string): Entry => d[key] ?? EMPTY;
const sameEntry = (a: Entry, b: Entry) =>
  a.enabled === b.enabled && (a.label ?? "") === (b.label ?? "");

const LOCKED = new Set<string>(
  TENANT_SECTIONS.flatMap((s) => [
    ...(s.locked ? [s.key] : []),
    ...s.items.filter((i) => i.locked).map((i) => i.key),
  ]),
);

function NavigationControls() {
  const [scope, setScope] = useState<string>(GLOBAL);
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  const [defaults, setDefaults] = useState<Draft>({}); // always the platform row set
  const [initial, setInitial] = useState<Draft>({});   // rows for the current scope
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isGlobal = scope === GLOBAL;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tenants").select("id, name, city").order("name");
      setTenants((data as TenantRow[]) ?? []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: defRows } = await navDb
      .from("nav_defaults").select("key, enabled, label");
    const defMap: Draft = {};
    for (const r of (defRows ?? []) as NavRow[]) defMap[r.key] = { enabled: r.enabled, label: r.label };
    setDefaults(defMap);

    let scopeMap: Draft = defMap;
    if (!isGlobal) {
      const { data: ovRows } = await navDb
        .from("tenant_nav_overrides").select("key, enabled, label").eq("tenant_id", scope);
      scopeMap = {};
      for (const r of (ovRows ?? []) as NavRow[]) scopeMap[r.key] = { enabled: r.enabled, label: r.label };
    }

    setInitial(scopeMap);
    setDraft({ ...scopeMap });
    setLoading(false);
  }, [scope, isGlobal]);

  useEffect(() => { load(); }, [load]);

  const patch = (key: string, next: Partial<Entry>) =>
    setDraft((d) => ({ ...d, [key]: { ...entryOf(d, key), ...next } }));

  const reset = (key: string) =>
    setDraft((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });

  /** What the owner ends up seeing for this key under the current draft. */
  const effective = (key: string): boolean => {
    if (LOCKED.has(key)) return true;
    const own = entryOf(draft, key).enabled;
    if (own !== null && own !== undefined) return own;
    if (!isGlobal) {
      const d = entryOf(defaults, key).enabled;
      if (d !== null && d !== undefined) return d;
    }
    return true;
  };

  const inherited = (key: string) =>
    !isGlobal && (entryOf(draft, key).enabled === null || entryOf(draft, key).enabled === undefined);

  const dirtyKeys = useMemo(
    () => ALL_KEYS.filter((k) => !sameEntry(entryOf(draft, k), entryOf(initial, k))),
    [draft, initial],
  );

  async function save() {
    if (dirtyKeys.length === 0) return;
    setSaving(true);

    if (isGlobal) {
      const rows = dirtyKeys.map((key) => ({
        key,
        enabled: entryOf(draft, key).enabled ?? true,
        label: entryOf(draft, key).label?.trim() || null,
      }));
      const { error } = await navDb.from("nav_defaults").upsert(rows, { onConflict: "key" });
      setSaving(false);
      if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    } else {
      const upserts: any[] = [];
      const deletes: string[] = [];
      for (const key of dirtyKeys) {
        const e = entryOf(draft, key);
        const label = e.label?.trim() || null;
        if ((e.enabled === null || e.enabled === undefined) && !label) deletes.push(key);
        else upserts.push({ tenant_id: scope, key, enabled: e.enabled, label });
      }
      if (deletes.length) {
        const { error } = await navDb
          .from("tenant_nav_overrides").delete().eq("tenant_id", scope).in("key", deletes);
        if (error) { setSaving(false); toast.error(`Couldn't clear overrides: ${error.message}`); return; }
      }
      if (upserts.length) {
        const { error } = await navDb
          .from("tenant_nav_overrides").upsert(upserts, { onConflict: "tenant_id,key" });
        if (error) { setSaving(false); toast.error(`Couldn't save: ${error.message}`); return; }
      }
      setSaving(false);
    }

    toast.success(
      isGlobal
        ? "Platform navigation updated for all restaurants."
        : "Navigation updated for this restaurant.",
    );
    load();
  }

  const scopeName =
    isGlobal ? "All restaurants" : tenants.find((t) => t.id === scope)?.name ?? "Restaurant";

  const hiddenCount = ALL_KEYS.filter((k) => !LOCKED.has(k) && !effective(k)).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <h2 className="text-xl font-semibold">Owner navigation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which sections and pages restaurant owners can see, and rename them.
          Hidden pages are also blocked by direct URL, not just removed from the sidebar.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Applies to</CardTitle>
          <CardDescription>
            Set a platform-wide default, then override it for individual restaurants.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL}>Platform defaults — all restaurants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name ?? "Unnamed"}{t.city ? ` · ${t.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={hiddenCount ? "secondary" : "outline"}>
            {hiddenCount === 0 ? "Nothing hidden" : `${hiddenCount} hidden`}
          </Badge>
          {!isGlobal && (
            <span className="text-xs text-muted-foreground">
              Blank rows inherit the platform default.
            </span>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid min-h-[30vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : (
        TENANT_SECTIONS.map((section) => {
          const sectionOn = effective(section.key);
          return (
            <Card key={section.key} className={sectionOn ? "" : "opacity-70"}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {section.label}
                    {section.locked && (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Lock className="h-3 w-3" />Always on
                      </Badge>
                    )}
                    {inherited(section.key) && !section.locked && (
                      <Badge variant="outline" className="font-normal">Inherited</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {sectionOn
                      ? "Group heading is visible in the owner sidebar."
                      : "Whole group is hidden, including every page inside it."}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!isGlobal && !section.locked && !inherited(section.key) && (
                    <Button variant="ghost" size="icon" aria-label="Reset to platform default"
                      onClick={() => reset(section.key)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Switch
                    checked={sectionOn}
                    disabled={section.locked}
                    aria-label={`Show ${section.label} group`}
                    onCheckedChange={(v) => patch(section.key, { enabled: v })}
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`label-${section.key}`} className="text-xs text-muted-foreground">
                    Group heading shown to owners
                  </Label>
                  <Input
                    id={`label-${section.key}`}
                    value={entryOf(draft, section.key).label ?? ""}
                    placeholder={section.label}
                    onChange={(e) => patch(section.key, { label: e.target.value })}
                  />
                </div>

                <div className="divide-y rounded-lg border">
                  {section.items.map((item) => {
                    const on = effective(item.key) && sectionOn;
                    const itemInherited = inherited(item.key);
                    return (
                      <div key={item.key}
                        className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                        <item.icon className={`h-4 w-4 shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{item.label}</span>
                            {item.locked && (
                              <Badge variant="outline" className="gap-1 font-normal">
                                <Lock className="h-3 w-3" />Always on
                              </Badge>
                            )}
                            {item.secure && (
                              <Badge variant="outline" className="font-normal">PIN</Badge>
                            )}
                            {itemInherited && !item.locked && (
                              <Badge variant="outline" className="font-normal">Inherited</Badge>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{item.to}</div>
                        </div>
                        <Input
                          className="h-9 w-full sm:w-52"
                          value={entryOf(draft, item.key).label ?? ""}
                          placeholder={`Rename “${item.label}”`}
                          aria-label={`Label for ${item.label}`}
                          onChange={(e) => patch(item.key, { label: e.target.value })}
                        />
                        {!isGlobal && !item.locked && !itemInherited && (
                          <Button variant="ghost" size="icon" aria-label="Reset to platform default"
                            onClick={() => reset(item.key)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="flex items-center gap-2">
                          {on ? <Eye className="h-4 w-4 text-muted-foreground" />
                              : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                          <Switch
                            checked={effective(item.key)}
                            disabled={item.locked || !sectionOn}
                            aria-label={`Show ${item.label}`}
                            onCheckedChange={(v) => patch(item.key, { enabled: v })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Sticky save bar — nothing is written until you confirm. */}
      {dirtyKeys.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <span className="text-sm">
              <b>{dirtyKeys.length}</b> unsaved change{dirtyKeys.length === 1 ? "" : "s"} · {scopeName}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setDraft({ ...initial })} disabled={saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                  : <><Save className="mr-2 h-4 w-4" />Save changes</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}