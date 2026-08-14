-- The whatsapp-dispatch endpoint previously "authenticated" the cron caller by
-- comparing the request's apikey header to the Supabase *publishable* key —
-- that key ships in the client bundle, so the check authenticated nobody.
--
-- This migration re-points the cron job at a real, secret value pulled from
-- Supabase Vault instead of a hardcoded literal (so the secret never lands in
-- a git-committed migration file).
--
-- Before applying this migration, create the vault secret once via the SQL
-- editor (this value should match the WHATSAPP_DISPATCH_SECRET env var set on
-- the app server):
--   select vault.create_secret('<a-long-random-value>', 'whatsapp_dispatch_secret');

SELECT cron.unschedule('whatsapp-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-dispatch');

SELECT cron.schedule(
  'whatsapp-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--871470bd-2505-440a-b84e-8a6e89bebc45.lovable.app/api/public/whatsapp-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_dispatch_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
