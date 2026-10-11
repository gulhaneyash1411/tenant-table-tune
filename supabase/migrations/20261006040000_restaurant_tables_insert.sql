-- Fix restaurant_tables INSERT/UPDATE/DELETE policies
-- The existing "tbl tenant write" policy uses current_tenant_id() which only returns one tenant
-- This breaks multi-outlet owners trying to create tables in other outlets

DROP POLICY IF EXISTS "tbl tenant write" ON public.restaurant_tables;

CREATE POLICY "rest_tbl authenticated write" ON public.restaurant_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can insert tables for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = restaurant_tables.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can insert tables for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = restaurant_tables.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can insert
    public.is_super_admin(auth.uid())
  );

-- Update policy
CREATE POLICY "rest_tbl authenticated update" ON public.restaurant_tables
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = restaurant_tables.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = restaurant_tables.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = restaurant_tables.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = restaurant_tables.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Delete policy
CREATE POLICY "rest_tbl authenticated delete" ON public.restaurant_tables
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = restaurant_tables.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = restaurant_tables.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );
