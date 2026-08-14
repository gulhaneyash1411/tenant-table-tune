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
