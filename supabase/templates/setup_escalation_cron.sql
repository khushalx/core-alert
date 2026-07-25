-- Run after deploying process-incident-escalations and storing the same random
-- ESCALATION_CRON_SECRET in both Supabase Vault and Edge Function secrets.
-- Replace the two placeholders only in the vault setup calls before executing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'core_alert_project_url',
  'Core Alert project URL used by the escalation cron job'
);
select vault.create_secret(
  'YOUR_ESCALATION_CRON_SECRET',
  'core_alert_escalation_cron_secret',
  'Shared secret used only between pg_cron and the escalation Edge Function'
);

select cron.schedule(
  'core-alert-incident-escalation',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'core_alert_project_url')
      || '/functions/v1/process-incident-escalations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-core-alert-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'core_alert_escalation_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
