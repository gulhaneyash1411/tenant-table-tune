// Server-side counterpart of src/lib/outlet-context.ts.
//
// An owner can have several outlets (tenant rows), so "the owner's tenant" is
// no longer a single row, and Outlet Managers reach outlets through roles
// rather than ownership. The browser sends the outlet it is working in as the
// `x-outlet-id` header (see attachOutlet in src/start.ts and the fetch calls to
// /api/*). This resolves it, but only ever to an outlet the caller OWNS or holds
// a role on — a forged header can't reach anyone else's outlet, it just falls
// back to the caller's first outlet.

type Loose = { from: (table: string) => any };

export const OUTLET_HEADER = "x-outlet-id";

const UUID = /^[0-9a-f-]{36}$/i;

/** Outlets the caller owns (owner) or is assigned to (manager). */
export async function resolveOutlet<T = { id: string }>(
  client: Loose,
  userId: string,
  requestedOutletId: string | null | undefined,
  columns = "id",
  { ownerOnly = false }: { ownerOnly?: boolean } = {},
): Promise<T | null> {
  const requested = requestedOutletId && UUID.test(requestedOutletId) ? requestedOutletId : null;

  if (requested) {
    const { data } = await client
      .from("tenants").select(columns).eq("id", requested).eq("owner_id", userId).maybeSingle();
    if (data) return data as T;
    if (!ownerOnly) {
      const { data: role } = await client
        .from("user_roles").select("tenant_id").eq("user_id", userId).eq("tenant_id", requested).limit(1).maybeSingle();
      if (role) {
        const { data: t } = await client.from("tenants").select(columns).eq("id", requested).maybeSingle();
        if (t) return t as T;
      }
    }
  }

  const { data: owned } = await client
    .from("tenants").select(columns).eq("owner_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (owned) return owned as T;
  if (ownerOnly) return null;

  const { data: role } = await client
    .from("user_roles").select("tenant_id").eq("user_id", userId).not("tenant_id", "is", null)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!role?.tenant_id) return null;
  const { data: t } = await client.from("tenants").select(columns).eq("id", role.tenant_id).maybeSingle();
  return (t as T) ?? null;
}
