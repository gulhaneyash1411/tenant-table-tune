-- Tracks which devices a tenant's kitchen account has signed in from, so the
-- owner can be told when a new one appears. Kitchen credentials get shared
-- verbally and written on walls; an unexpected device is the signal that the
-- login has travelled further than intended.
--
-- The device identity is a random id the browser generates once and keeps in
-- localStorage. It is not a fingerprint and identifies a browser profile, not
-- a person — clearing site data looks like a new device, which is the safe
-- direction to fail.

CREATE TABLE IF NOT EXISTS public.kitchen_login_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  login_count INT NOT NULL DEFAULT 1,
  UNIQUE (user_id, device_hash)
);

-- Owners read their own device list; everything is written by the service-role
-- API route so there is one auditable write path, same posture as
-- kitchen_accounts.
GRANT SELECT ON public.kitchen_login_devices TO authenticated;
GRANT ALL ON public.kitchen_login_devices TO service_role;
ALTER TABLE public.kitchen_login_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_devices tenant read" ON public.kitchen_login_devices;
CREATE POLICY "kitchen_devices tenant read" ON public.kitchen_login_devices
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_kitchen_devices_tenant
  ON public.kitchen_login_devices (tenant_id, last_seen_at DESC);

-- Records a kitchen sign-in and notifies the owner the first time a device
-- appears. Returns true when the device was new.
CREATE OR REPLACE FUNCTION public.record_kitchen_login(
  p_user_id UUID,
  p_device_hash TEXT,
  p_user_agent TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_is_new BOOLEAN := false;
  v_known_count INT;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.kitchen_accounts WHERE user_id = p_user_id;
  IF v_tenant IS NULL THEN RETURN false; END IF;

  SELECT COUNT(*) INTO v_known_count
  FROM public.kitchen_login_devices WHERE user_id = p_user_id;

  INSERT INTO public.kitchen_login_devices (tenant_id, user_id, device_hash, user_agent)
  VALUES (v_tenant, p_user_id, p_device_hash, LEFT(COALESCE(p_user_agent, ''), 400))
  ON CONFLICT (user_id, device_hash) DO UPDATE
    SET last_seen_at = now(),
        login_count = kitchen_login_devices.login_count + 1
  RETURNING (login_count = 1) INTO v_is_new;

  -- The very first device a kitchen account ever uses is expected (the owner
  -- just set the account up), so only warn from the second device onwards.
  IF v_is_new AND v_known_count > 0 THEN
    PERFORM public.notify_tenant_owner(
      v_tenant,
      'Kitchen login used on a new device',
      'Your kitchen account just signed in from a device it has not been used on before. ' ||
        'If this was not your kitchen staff, change the kitchen password in Settings.',
      'kitchen_new_device',
      'kdev:' || p_user_id || ':' || p_device_hash,
      jsonb_build_object('user_agent', LEFT(COALESCE(p_user_agent, ''), 200))
    );
  END IF;

  RETURN v_is_new AND v_known_count > 0;
END; $$;

-- Only the service-role API route may call this; revoking from PUBLIC also
-- strips service_role, so grant it back explicitly.
REVOKE EXECUTE ON FUNCTION public.record_kitchen_login(uuid,text,text) FROM PUBLIC;
DO $$ BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.record_kitchen_login(uuid,text,text) FROM anon, authenticated;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
GRANT EXECUTE ON FUNCTION public.record_kitchen_login(uuid,text,text) TO service_role;
