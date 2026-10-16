-- The free trial as its own plan row: features and limits a restaurant gets
-- before buying a plan. Hidden (is_active = false) so it is never offered for sale.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_single_free
  ON public.subscription_plans (is_free) WHERE is_free;

-- features = {} keeps every feature open and NULL limits are unlimited,
-- which is how the trial behaved before this row existed.
-- Names are unique, so take the first candidate no existing plan uses.
INSERT INTO public.subscription_plans
  (name, description, monthly_price, half_yearly_price, yearly_price,
   max_tables, max_orders_month, max_menu_items, max_staff,
   features, is_active, is_free, sort_order)
SELECT c.name, 'What every new restaurant gets before buying a plan.', 0, 0, 0,
       NULL, NULL, NULL, NULL,
       '{}'::jsonb, false, true, -1
FROM (VALUES (1, 'Free trial'), (2, 'Free plan'), (3, 'Trial plan')) AS c(ord, name)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE is_free)
  AND NOT EXISTS (SELECT 1 FROM public.subscription_plans p WHERE lower(p.name) = lower(c.name))
ORDER BY c.ord
LIMIT 1
ON CONFLICT DO NOTHING;
