-- Phase 5: outlet managers.
--
-- A manager is a normal auth user with one `user_roles` row (role='manager',
-- tenant_id = outlet) per outlet they are assigned to. Every existing RLS policy
-- already lets a user reach their role's tenant through current_tenant_id(), so a
-- manager automatically sees exactly their assigned outlet(s) and no others.
-- Invitations and role rows are written by the /api/outlet-users server route
-- (service role); the owner never sees or sets a manager's password.

-- Display/admin record for people the owner invited (service-role only).
CREATE TABLE IF NOT EXISTS public.organization_users (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  mobile TEXT,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('manager')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.organization_users TO service_role;

-- Super admin can do everything
DROP POLICY IF EXISTS "org users super all" ON public.organization_users;
CREATE POLICY "org users super all" ON public.organization_users
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Organization owners can read their organization's users (managers)
DROP POLICY IF EXISTS "org users owner read" ON public.organization_users;
CREATE POLICY "org users owner read" ON public.organization_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_users.organization_id
        AND o.owner_id = auth.uid()
    )
  );

-- System queries need to read this table for RLS policy checks
-- This allows any query (like in orders UPDATE policy) to check manager status
DROP POLICY IF EXISTS "org users system read" ON public.organization_users;
CREATE POLICY "org users system read" ON public.organization_users
  FOR SELECT USING (true);

-- Is the caller the owner of this outlet? (Managers are not.)
CREATE OR REPLACE FUNCTION public.is_outlet_owner(_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.owner_id = auth.uid());
$$;

-- Organizations the caller reaches through an outlet role.
CREATE OR REPLACE FUNCTION public.user_role_organization_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT t.organization_id FROM public.tenants t
  JOIN public.user_roles ur ON ur.tenant_id = t.id
  WHERE ur.user_id = auth.uid() AND t.organization_id IS NOT NULL;
$$;

-- A manager can read every outlet they are assigned to (not just the selected
-- one) and the organization those outlets belong to.
DROP POLICY IF EXISTS "tenants assigned read" ON public.tenants;
CREATE POLICY "tenants assigned read" ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id IS NOT NULL));

DROP POLICY IF EXISTS "orgs assigned read" ON public.organizations;
CREATE POLICY "orgs assigned read" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_role_organization_ids()));

-- Billing is the owner's, not a manager's (or kitchen user's): keep read access
-- for anyone on the outlet, but writes need the owner.
DROP POLICY IF EXISTS "subs tenant write" ON public.subscriptions;
DROP POLICY IF EXISTS "subs owner write" ON public.subscriptions;
CREATE POLICY "subs owner write" ON public.subscriptions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_outlet_owner(tenant_id))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_outlet_owner(tenant_id));

DROP POLICY IF EXISTS "inv tenant write" ON public.invoices;
DROP POLICY IF EXISTS "inv owner write" ON public.invoices;
CREATE POLICY "inv owner write" ON public.invoices
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_outlet_owner(tenant_id))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_outlet_owner(tenant_id));
