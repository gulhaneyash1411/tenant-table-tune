import type { SupabaseClient } from "@supabase/supabase-js";

export type Segment = {
  type: "all" | "frequent" | "inactive" | "range" | "birthday" | "anniversary" | "manual";
  min_visits?: number;
  inactive_days?: number;
  from?: string;
  to?: string;
  ids?: string[];
};

export type Recipient = {
  id: string;
  name: string;
  phone: string;
  visits: number;
  last_visit: string | null;
};

function mmdd(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function resolveSegment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  tenantId: string,
  segment: Segment,
): Promise<Recipient[]> {
  let q = client
    .from("customers")
    .select("id,name,phone,visits,last_visit,birthday,anniversary")
    .eq("tenant_id", tenantId)
    .not("phone", "is", null);

  if (segment.type === "manual" && segment.ids?.length) q = q.in("id", segment.ids);
  if (segment.type === "frequent") q = q.gte("visits", segment.min_visits ?? 3);
  if (segment.type === "inactive") {
    const cutoff = new Date(Date.now() - (segment.inactive_days ?? 30) * 86400000).toISOString();
    q = q.or(`last_visit.is.null,last_visit.lt.${cutoff}`);
  }
  if (segment.type === "range") {
    if (segment.from) q = q.gte("last_visit", new Date(segment.from).toISOString());
    if (segment.to) q = q.lte("last_visit", new Date(`${segment.to}T23:59:59`).toISOString());
  }

  const { data, error } = await q.limit(5000);
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as (Recipient & { birthday: string | null; anniversary: string | null })[];

  if (segment.type === "birthday" || segment.type === "anniversary") {
    const today = mmdd(new Date());
    const field = segment.type === "birthday" ? "birthday" : "anniversary";
    rows = rows.filter((r) => {
      const v = r[field as "birthday" | "anniversary"];
      return !!v && v.slice(5) === today;
    });
  }

  const seen = new Set<string>();
  return rows
    .filter((r) => r.phone && r.phone.trim().length >= 8)
    .filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)))
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      visits: r.visits ?? 0,
      last_visit: r.last_visit,
    }));
}