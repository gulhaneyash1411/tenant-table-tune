-- Fix staff_members RLS policies for multi-outlet support

DROP POLICY IF EXISTS "staff tenant all" ON public.staff_members;

CREATE POLICY "staff authenticated all" ON public.staff_members
  FOR ALL
  TO authenticated
  USING (
    -- Owner can manage staff for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = staff_members.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can manage staff for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = staff_members.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can manage all
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = staff_members.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = staff_members.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );
