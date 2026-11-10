-- Managers can see and update notifications for outlets assigned through
-- user_roles, independently of organization_users membership.
DROP POLICY IF EXISTS "notif manager assigned outlet read" ON public.notifications;
CREATE POLICY "notif manager assigned outlet read" ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'
        AND ur.tenant_id = notifications.tenant_id
    )
  );

DROP POLICY IF EXISTS "notif own update" ON public.notifications;
CREATE POLICY "notif own update" ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'
        AND ur.tenant_id = notifications.tenant_id
    )
  )
  WITH CHECK (
    recipient_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'
        AND ur.tenant_id = notifications.tenant_id
    )
  );

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
