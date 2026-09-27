-- Sales Team feature: lets the Super Admin create any number of Sales User
-- logins. Unlike kitchen_accounts (capped at one per tenant), there's no
-- tenant to scope this by — a Sales User is platform-side staff, same as
-- super_admin (tenant_id IS NULL in user_roles), and there's no cap on how
-- many can exist.
--
-- Display fields (name/email) aren't duplicated here — they're read by
-- joining `profiles`, which the existing handle_new_user trigger already
-- populates the moment the auth.users row is created, regardless of which
-- API created it. This table only tracks what's specific to the Sales
-- account itself.
--
-- All writes (create / rotate password / enable-disable / delete) go
-- through the service-role server route (src/routes/api/sales-account.ts)
-- via supabaseAdmin, never directly from the browser — so, same as
-- kitchen_accounts, this table is read-only to `authenticated` at the RLS
-- layer.
CREATE TABLE IF NOT EXISTS public.sales_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_accounts TO authenticated;
GRANT ALL ON public.sales_accounts TO service_role;
ALTER TABLE public.sales_accounts ENABLE ROW LEVEL SECURITY;

-- The Super Admin manages the whole list; a Sales User can read their own
-- row (e.g. for a future self-service "am I still active" check) — the two
-- permissive policies OR together.
CREATE POLICY "sales_accounts admin read" ON public.sales_accounts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "sales_accounts self read" ON public.sales_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER sales_accounts_touch BEFORE UPDATE ON public.sales_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
