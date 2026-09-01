do $block$
declare
  v_existing bigint;
begin
  select jobid into v_existing from cron.job where jobname='market-courier-track-poll';
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;

  perform cron.schedule(
    'market-courier-track-poll',
    '*/15 * * * *',
    $cmd$
      select net.http_post(
        url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/courier-track-poll',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret',(
            select decrypted_secret
            from vault.decrypted_secrets
            where name='courier_tracking_cron_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb
      );
    $cmd$
  );
end;
$block$;
