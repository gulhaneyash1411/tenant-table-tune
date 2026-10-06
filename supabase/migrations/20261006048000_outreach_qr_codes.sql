-- Organization-level QR codes (Feedback, Takeaway, Delivery)
-- These are different from table QRs - one per organization, not per table

CREATE TABLE IF NOT EXISTS public.outreach_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('feedback', 'takeaway', 'delivery')),
  token TEXT NOT NULL DEFAULT public.new_qr_token(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, type)
);

CREATE INDEX IF NOT EXISTS outreach_qr_codes_tenant_idx ON public.outreach_qr_codes(tenant_id);
CREATE INDEX IF NOT EXISTS outreach_qr_codes_type_idx ON public.outreach_qr_codes(type);

GRANT SELECT ON public.outreach_qr_codes TO authenticated;
GRANT ALL ON public.outreach_qr_codes TO service_role;
ALTER TABLE public.outreach_qr_codes ENABLE ROW LEVEL SECURITY;

-- Public can check QR status (for disabled QR validation on public routes)
DROP POLICY IF EXISTS "orc public read" ON public.outreach_qr_codes;

CREATE POLICY "orc public read" ON public.outreach_qr_codes
  FOR SELECT
  TO public
  USING (TRUE);

-- Owner can manage outreach QRs for their outlets
DROP POLICY IF EXISTS "orc owner read" ON public.outreach_qr_codes;
DROP POLICY IF EXISTS "orc owner all" ON public.outreach_qr_codes;

CREATE POLICY "orc owner read" ON public.outreach_qr_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = outreach_qr_codes.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = outreach_qr_codes.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "orc owner all" ON public.outreach_qr_codes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = outreach_qr_codes.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = outreach_qr_codes.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = outreach_qr_codes.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = outreach_qr_codes.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Auto-create outreach QR records for new tenants
DROP TRIGGER IF EXISTS tenant_create_outreach_qrs ON public.tenants;
DROP FUNCTION IF EXISTS public.tenant_create_outreach_qrs();

CREATE FUNCTION public.tenant_create_outreach_qrs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.outreach_qr_codes (tenant_id, type)
  VALUES
    (NEW.id, 'feedback'),
    (NEW.id, 'takeaway'),
    (NEW.id, 'delivery')
  ON CONFLICT (tenant_id, type) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_create_outreach_qrs
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenant_create_outreach_qrs();

-- Backfill existing tenants
INSERT INTO public.outreach_qr_codes (tenant_id, type)
SELECT id, 'feedback' FROM public.tenants WHERE true
  ON CONFLICT (tenant_id, type) DO NOTHING;
INSERT INTO public.outreach_qr_codes (tenant_id, type)
SELECT id, 'takeaway' FROM public.tenants WHERE true
  ON CONFLICT (tenant_id, type) DO NOTHING;
INSERT INTO public.outreach_qr_codes (tenant_id, type)
SELECT id, 'delivery' FROM public.tenants WHERE true
  ON CONFLICT (tenant_id, type) DO NOTHING;

