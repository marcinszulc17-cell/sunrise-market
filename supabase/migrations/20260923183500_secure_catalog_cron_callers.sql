-- Authenticate cron callers for catalog/order bridge workers using the shared database-held secret.

select cron.alter_job(
  1,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/teemdrop-bridge',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

select cron.alter_job(
  2,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/woo-catalog-pull',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{"max_pages":40}'::jsonb
    );
  $cmd$
);
