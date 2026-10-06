-- Allow outlet managers to READ section locks (but not write/modify them).
-- This lets them enter the PIN to access locked pages, but prevents them from changing it.

ALTER TABLE public.tenant_section_locks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS manager_read_section_locks ON public.tenant_section_locks;
DROP POLICY IF EXISTS owner_read_section_locks ON public.tenant_section_locks;

-- Managers can read the PIN for their assigned outlets
CREATE POLICY manager_read_section_locks ON public.tenant_section_locks
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'manager'
        AND user_roles.tenant_id = tenant_section_locks.tenant_id
    )
  );

-- Owners can read their own section locks
CREATE POLICY owner_read_section_locks ON public.tenant_section_locks
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.owner_id = auth.uid()
        AND tenants.id = tenant_section_locks.tenant_id
    )
  );
