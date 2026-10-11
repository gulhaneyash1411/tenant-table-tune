-- Allow restaurant owners to read subscriptions for all their outlets
-- The existing "subs tenant read" policy only returns one tenant due to LIMIT 1 in current_tenant_id()
-- This new policy allows owners to read subscriptions for ANY tenant they own

DROP POLICY IF EXISTS "subs owner read" ON public.subscriptions;

CREATE POLICY "subs owner read" ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read subscriptions for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = subscriptions.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );
