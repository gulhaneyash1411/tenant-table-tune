-- Fix menu_categories and menu_items INSERT/UPDATE/DELETE policies
-- The existing policies use current_tenant_id() which only returns one tenant
-- This breaks multi-outlet owners trying to manage menus in other outlets

-- ============ MENU CATEGORIES ============
DROP POLICY IF EXISTS "cat tenant write" ON public.menu_categories;

CREATE POLICY "cat authenticated write" ON public.menu_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can insert for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_categories.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can insert for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_categories.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can insert
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "cat authenticated update" ON public.menu_categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_categories.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_categories.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_categories.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_categories.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "cat authenticated delete" ON public.menu_categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_categories.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_categories.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- ============ MENU ITEMS ============
DROP POLICY IF EXISTS "mi tenant write" ON public.menu_items;

CREATE POLICY "mi authenticated write" ON public.menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner can insert for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_items.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can insert for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_items.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can insert
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "mi authenticated update" ON public.menu_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_items.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_items.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_items.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_items.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "mi authenticated delete" ON public.menu_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = menu_items.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = menu_items.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );
