-- Outlet manager rules.

-- 1) One manager per outlet. (The /api/outlet-users route checks this first and
--    returns a friendly message; this index is the guarantee.)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_manager_per_outlet
  ON public.user_roles (tenant_id)
  WHERE role = 'manager' AND tenant_id IS NOT NULL;

-- 2) The 4-digit section PIN (revenue / expenses / analytics / staff) is created
--    and changed by the OWNER only. A manager may still ENTER the PIN — that only
--    updates the attempt counters — but cannot set or change the PIN itself,
--    however the write is made (including through set_section_password()).
CREATE OR REPLACE FUNCTION public.tenant_section_locks_owner_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.is_outlet_owner(NEW.tenant_id)
     AND (TG_OP = 'INSERT' OR NEW.password_hash IS DISTINCT FROM OLD.password_hash)
  THEN
    RAISE EXCEPTION 'Only the business owner can set or change the PIN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_section_locks_owner_only ON public.tenant_section_locks;
CREATE TRIGGER tenant_section_locks_owner_only
  BEFORE INSERT OR UPDATE ON public.tenant_section_locks
  FOR EACH ROW EXECUTE FUNCTION public.tenant_section_locks_owner_only();
