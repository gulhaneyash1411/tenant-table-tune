CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('whatsapp-dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-dispatch');

SELECT cron.schedule(
  'whatsapp-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--871470bd-2505-440a-b84e-8a6e89bebc45.lovable.app/api/public/whatsapp-dispatch',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_SLQT6gJaESbXWxyW_UI3kA_wteeWZgM"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);