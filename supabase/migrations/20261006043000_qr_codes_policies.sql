-- Fix QR codes policies for multi-outlet and public access

-- Fix authenticated read for multi-outlet owners
DROP POLICY IF EXISTS "qr tenant read" ON public.qr_codes;

CREATE POLICY "qr authenticated read" ON public.qr_codes
  FOR SELECT
  TO authenticated
  USING (
    -- Owner can read QR codes for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = qr_codes.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can read QR codes for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = qr_codes.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can read all
    public.is_super_admin(auth.uid())
  );

-- Allow public/anonymous users to read active QR codes by token (for customer scanning)
CREATE POLICY "qr public read active" ON public.qr_codes
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.restaurant_tables rt
      WHERE rt.id = qr_codes.table_id AND rt.is_active
    )
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = qr_codes.tenant_id AND t.status = 'approved' AND t.outlet_status = 'ACTIVE'
    )
  );
