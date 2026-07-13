
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slogan TEXT,
  ADD COLUMN IF NOT EXISTS opening_time TEXT,
  ADD COLUMN IF NOT EXISTS closing_time TEXT;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE OR REPLACE FUNCTION public.bump_customer_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_phone IS NOT NULL AND NEW.customer_phone <> '' THEN
    INSERT INTO public.customers (tenant_id, name, phone, visits, total_spend, last_visit)
    VALUES (NEW.tenant_id, COALESCE(NEW.customer_name,'Guest'), NEW.customer_phone, 1, COALESCE(NEW.total,0), now())
    ON CONFLICT (tenant_id, phone) DO UPDATE
      SET visits = public.customers.visits + 1,
          total_spend = public.customers.total_spend + COALESCE(NEW.total,0),
          last_visit = now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_customer_stats ON public.orders;
CREATE TRIGGER trg_bump_customer_stats AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.bump_customer_stats();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_tables' AND policyname='tables public read') THEN
    CREATE POLICY "tables public read" ON public.restaurant_tables FOR SELECT USING (true);
  END IF;
END $$;

GRANT SELECT ON public.restaurant_tables TO anon;
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT ON public.tenants TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.subscription_plans TO anon;
