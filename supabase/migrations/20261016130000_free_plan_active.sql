-- is_active on the free plan now means "new restaurants get a free trial".
-- Plan lists exclude it by is_free instead, so switch the seeded row on.
UPDATE public.subscription_plans SET is_active = true WHERE is_free;
