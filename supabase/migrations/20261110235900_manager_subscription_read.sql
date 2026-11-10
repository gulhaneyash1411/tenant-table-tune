-- Managers are assigned to outlets through user_roles. Keep subscription reads
-- aligned with that assignment, even when organization_users is unavailable.
DROP POLICY IF EXISTS "subs manager assigned outlet read" ON public.subscriptions;

CREATE POLICY "subs manager assigned outlet read" ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'
        AND ur.tenant_id = subscriptions.tenant_id
    )
  );
