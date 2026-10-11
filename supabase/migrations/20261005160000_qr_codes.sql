-- Phase 6/8: one secure, revocable QR token per table.
--
-- The QR no longer encodes the table's database id. It encodes an unguessable
-- token (/order/{token}); the token is resolved server-side to the table, and
-- only while the QR is ACTIVE, the table is active and the outlet is ACTIVE
-- (i.e. paid). Existing printed QRs (/t/{table uuid}) keep working through
-- `legacy_url_enabled`, which regenerating or revoking a QR switches off.

CREATE OR REPLACE FUNCTION public.new_qr_token()
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 40);
$$;

CREATE TABLE IF NOT EXISTS public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL UNIQUE REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT public.new_qr_token(),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  legacy_url_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS qr_codes_tenant_idx ON public.qr_codes(tenant_id);

-- Existing tables: keep their printed /t/{uuid} QRs working.
INSERT INTO public.qr_codes (tenant_id, table_id, legacy_url_enabled)
SELECT rt.tenant_id, rt.id, true FROM public.restaurant_tables rt
ON CONFLICT (table_id) DO NOTHING;

-- Every new table gets its QR automatically (new QRs are token-only).
CREATE OR REPLACE FUNCTION public.restaurant_tables_create_qr()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.qr_codes (tenant_id, table_id) VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (table_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS restaurant_tables_create_qr ON public.restaurant_tables;
CREATE TRIGGER restaurant_tables_create_qr
  AFTER INSERT ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.restaurant_tables_create_qr();

-- Read-only from the client: tokens can only change through the functions below.
GRANT SELECT ON public.qr_codes TO authenticated;
GRANT ALL ON public.qr_codes TO service_role;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr tenant read" ON public.qr_codes
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "qr super all" ON public.qr_codes
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Can the caller manage QRs for this table? (owner/manager of the outlet, or super admin)
CREATE OR REPLACE FUNCTION public.can_manage_table_qr(_table_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.restaurant_tables rt
    WHERE rt.id = _table_id AND rt.tenant_id = public.current_tenant_id()
  );
$$;

-- New token; the previous token AND the old /t/{uuid} link stop working.
CREATE OR REPLACE FUNCTION public.regenerate_table_qr(p_table_id UUID)
RETURNS public.qr_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.qr_codes;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_table_qr(p_table_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.qr_codes
  SET token = public.new_qr_token(), status = 'ACTIVE', legacy_url_enabled = false,
      revoked_at = NULL, updated_at = now()
  WHERE table_id = p_table_id
  RETURNING * INTO v;
  IF v.id IS NULL THEN RAISE EXCEPTION 'QR code not found'; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_table_qr_status(p_table_id UUID, p_status TEXT)
RETURNS public.qr_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.qr_codes;
BEGIN
  IF p_status NOT IN ('ACTIVE', 'REVOKED') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_table_qr(p_table_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.qr_codes
  SET status = p_status, updated_at = now(),
      revoked_at = CASE WHEN p_status = 'REVOKED' THEN now() ELSE NULL END
  WHERE table_id = p_table_id
  RETURNING * INTO v;
  IF v.id IS NULL THEN RAISE EXCEPTION 'QR code not found'; END IF;
  RETURN v;
END;
$$;

-- Public (QR scan) resolution: token or legacy table uuid -> table, but only
-- while QR is ACTIVE, the table is active, and the outlet is approved + ACTIVE.
CREATE OR REPLACE FUNCTION public.resolve_table_qr(p_key TEXT)
RETURNS TABLE (table_id UUID, tenant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.table_id, q.tenant_id
  FROM public.qr_codes q
  JOIN public.restaurant_tables rt ON rt.id = q.table_id AND rt.is_active
  JOIN public.tenants t ON t.id = q.tenant_id AND t.status = 'approved' AND t.outlet_status = 'ACTIVE'
  WHERE q.status = 'ACTIVE'
    AND (
      q.token = p_key
      OR (q.legacy_url_enabled AND p_key ~* '^[0-9a-f-]{36}$' AND q.table_id::text = lower(p_key))
    )
  LIMIT 1;
$$;

-- Server-side order placement check (service role): is this table's QR live?
CREATE OR REPLACE FUNCTION public.table_qr_is_active(p_table_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.qr_codes q WHERE q.table_id = p_table_id AND q.status = 'ACTIVE');
$$;

REVOKE ALL ON FUNCTION public.regenerate_table_qr(UUID), public.set_table_qr_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_table_qr(UUID), public.set_table_qr_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_table_qr(TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.table_qr_is_active(UUID), public.can_manage_table_qr(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.table_qr_is_active(UUID) TO service_role;
