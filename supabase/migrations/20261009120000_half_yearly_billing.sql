-- Half-yearly billing cycle: a 6-month price per plan and a 6-month period step.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS half_yearly_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add one billing period to `base` (monthly / half_yearly / yearly / "<N> days").
-- Without the half_yearly branch it would fall through to one month.
CREATE OR REPLACE FUNCTION public._add_billing_cycle(base TIMESTAMPTZ, cycle TEXT)
RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN cycle = 'yearly' THEN base + INTERVAL '1 year'
    WHEN cycle = 'half_yearly' THEN base + INTERVAL '6 months'
    WHEN cycle ~ '^[0-9]+[ _]days?$' THEN base + make_interval(days => (regexp_replace(cycle, '[^0-9]', '', 'g'))::INT)
    ELSE base + INTERVAL '1 month'
  END;
$$;
