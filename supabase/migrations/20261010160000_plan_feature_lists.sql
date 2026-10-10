-- Admin-written feature lists shown on a plan card in the owner's subscription page.
-- Free text, e.g. "Unlimited KOT printing" under included, "Multi-outlet" under not included.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS included_features TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS not_included_features TEXT[] NOT NULL DEFAULT '{}';
