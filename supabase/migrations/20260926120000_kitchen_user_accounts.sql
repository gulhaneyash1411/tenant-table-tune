-- Kitchen User role: lets a Hotel Owner create exactly one dedicated login
-- for their kitchen (Kitchen Display access only). The auth account itself
-- lives in auth.users like any other user; this migration adds:
--   1. A `user_roles` row of the existing (until now unused) 'kitchen' role,
--      tagged with the owner's tenant_id — `current_tenant_id()` already
--      unions over `user_roles.tenant_id`, so every existing tenant-scoped
--      RLS policy (orders, order_items, menu, tables, ...) automatically and
--      correctly scopes a kitchen login to its own hotel with no policy
--      changes required.
--   2. A `kitchen_accounts` table: the owner-facing record of that account
--      (login identifier, active/disabled state), one row per tenant.
--
-- All writes to kitchen_accounts (and the auth.users row itself) go through
-- the service-role server route (src/routes/api/kitchen-account.ts) via
-- supabaseAdmin, never directly from the browser — so this table is
-- read-only to `authenticated` at the RLS layer.

-- At most one kitchen role per tenant (backstops the app-level check).
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_kitchen_per_tenant
  ON public.user_roles (tenant_id)
  WHERE role = 'kitchen';

CREATE TABLE IF NOT EXISTS public.kitchen_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  login_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only readable by the owning tenant (owner or the kitchen login itself,
-- since current_tenant_id() resolves to the same tenant for both) or a
-- super admin. No INSERT/UPDATE/DELETE grants to `authenticated` — account
-- creation, credential changes and enable/disable all go through the
-- service-role API route so there's exactly one, auditable write path.
GRANT SELECT ON public.kitchen_accounts TO authenticated;
GRANT ALL ON public.kitchen_accounts TO service_role;
ALTER TABLE public.kitchen_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kitchen_accounts tenant read" ON public.kitchen_accounts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER kitchen_accounts_touch BEFORE UPDATE ON public.kitchen_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
