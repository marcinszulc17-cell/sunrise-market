-- The JWT value itself is provisioned outside migrations as the Vault secret
-- `booking_mailer_cron_jwt`. This migration never stores credentials in Git.

do $$
begin
  if exists (select 1 from cron.job where jobname='booking-mailer') then
    perform cron.unschedule('booking-mailer');
  end if;
end $$;

select cron.schedule(
  'booking-mailer',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/booking-mailer',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='booking_mailer_cron_jwt' limit 1),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='booking_mailer_cron_jwt' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
