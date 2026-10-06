-- Final cleanup: Fix any remaining tenant_id = current_tenant_id() policies
-- This catches audit_logs, order_items, and reviews that still have read-only policies

-- ============ AUDIT LOGS ============
DROP POLICY IF EXISTS "audit super read" ON public.audit_logs;

CREATE POLICY "audit owner read" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read audit logs for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = audit_logs.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read audit logs for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = audit_logs.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ ORDER ITEMS ============
DROP POLICY IF EXISTS "oi tenant read" ON public.order_items;

CREATE POLICY "oi owner read" ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read order items for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = order_items.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read order items for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = order_items.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ REVIEWS ============
DROP POLICY IF EXISTS "rv tenant read" ON public.reviews;

CREATE POLICY "rv owner read" ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read reviews for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = reviews.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read reviews for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = reviews.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ SUPPORT TICKETS - Fix read policy ============
DROP POLICY IF EXISTS "tkt tenant read" ON public.support_tickets;

CREATE POLICY "tkt owner read" ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read tickets for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = support_tickets.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read tickets for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = support_tickets.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ NOTIFICATIONS - Fix read policy ============
DROP POLICY IF EXISTS "notif own read" ON public.notifications;

CREATE POLICY "notif owner read" ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid()
    OR
    -- Owner can read notifications for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = notifications.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read notifications for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = notifications.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );
