-- Allow restaurant owners to read tables from all their outlets
-- The existing policy uses current_tenant_id() which only returns one tenant
-- This new policy allows owners to read tables for any outlet they own

DROP POLICY IF EXISTS "rest_tbl owner read" ON public.restaurant_tables;

CREATE POLICY "rest_tbl owner read" ON public.restaurant_tables
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read tables for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = restaurant_tables.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );
