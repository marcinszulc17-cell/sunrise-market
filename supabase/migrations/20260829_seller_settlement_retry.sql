create table if not exists market.internal_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table market.internal_secrets enable row level security;
revoke all on market.internal_secrets from public, anon, authenticated;
grant all on market.internal_secrets to service_role;

insert into market.internal_secrets(key, value)
values ('seller_settlement_retry_token', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function market.invoke_seller_settlement_retry()
returns void
language plpgsql
security definer
set search_path = market, public, extensions
as $$
declare
  v_token text;
begin
  select value into v_token
  from market.internal_secrets
  where key = 'seller_settlement_retry_token';

  if v_token is null then
    raise exception 'seller settlement retry token missing';
  end if;

  perform net.http_post(
    url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/retry-seller-settlements',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-retry-token', v_token
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function market.invoke_seller_settlement_retry() from public, anon, authenticated;
grant execute on function market.invoke_seller_settlement_retry() to service_role;

do $$
declare jid bigint;
begin
  for jid in select jobid from cron.job where command = 'select market.invoke_seller_settlement_retry();'
  loop
    perform cron.unschedule(jid);
  end loop;
  perform cron.schedule(
    'seller-settlement-retry',
    '*/10 * * * *',
    'select market.invoke_seller_settlement_retry();'
  );
end $$;
