-- Fix remaining tables with current_tenant_id() policies

-- ============ NOTIFICATIONS ============
DROP POLICY IF EXISTS "notif super insert" ON public.notifications;

CREATE POLICY "notif authenticated insert" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can insert notifications for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = notifications.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can insert notifications for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = notifications.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can insert
    public.is_super_admin(auth.uid())
  );

-- ============ SUPPORT TICKETS ============
DROP POLICY IF EXISTS "tkt tenant insert" ON public.support_tickets;

CREATE POLICY "tkt authenticated insert" ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can insert tickets for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = support_tickets.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can insert tickets for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = support_tickets.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can insert
    public.is_super_admin(auth.uid())
  );

-- ============ CUSTOMERS - Fix multi-outlet read ============
DROP POLICY IF EXISTS "cust tenant read" ON public.customers;

CREATE POLICY "cust owner read" ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read customers for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = customers.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read customers for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = customers.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ INVOICES - Fix multi-outlet read ============
DROP POLICY IF EXISTS "inv tenant read" ON public.invoices;

CREATE POLICY "inv owner read" ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read invoices for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = invoices.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read invoices for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = invoices.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- ============ SUBSCRIPTIONS - Fix multi-outlet read ============
DROP POLICY IF EXISTS "subs tenant read" ON public.subscriptions;

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
    -- Manager can read subscriptions for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = subscriptions.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );
