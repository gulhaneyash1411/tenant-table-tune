-- Allow restaurant owners and managers to read orders from all their outlets
-- The existing "ord tenant read" policy uses current_tenant_id() which only returns one tenant
-- This new policy allows owners and managers to read orders for their outlets

DROP POLICY IF EXISTS "ord owner read" ON public.orders;
DROP POLICY IF EXISTS "ord manager read" ON public.orders;

CREATE POLICY "ord owner read" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read orders for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = orders.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "ord manager read" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    -- Manager can read orders for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = orders.tenant_id
        AND ou.role = 'manager'
    )
  );

-- Allow managers to create orders (INSERT policy)
DROP POLICY IF EXISTS "ord insert authenticated" ON public.orders;

CREATE POLICY "ord insert authenticated" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can create orders for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = orders.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can create orders for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = orders.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can create orders
    public.is_super_admin(auth.uid())
  );
