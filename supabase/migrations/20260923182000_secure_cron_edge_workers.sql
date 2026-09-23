-- Protect cron-triggered Edge Functions with a database-held random secret.
-- The secret value is generated in production and is never committed to Git.

insert into market.internal_secrets(key,value)
select 'cron_worker_secret', encode(extensions.gen_random_bytes(32),'hex')
where not exists (select 1 from market.internal_secrets where key='cron_worker_secret');

select cron.alter_job(
  14,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/verify-sweeper',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

select cron.alter_job(
  22,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/send-web-push',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

select cron.alter_job(
  3,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/enrich-descriptions',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{"limit":15}'::jsonb
    );
  $cmd$
);
