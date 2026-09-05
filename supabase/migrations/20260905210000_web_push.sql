-- Web push (VAPID) dla powiadomień Sunrise Market (2026-09-05). Klucze VAPID w market.internal_secrets
-- (vapid_public_key / vapid_private_key / vapid_subject) — NIGDY w repo. Przeglądarka subskrybuje przez SW (/sw.js),
-- zapis subskrypcji RPC save_push_subscription; każdy nowy wpis w market.notifications (channel='app')
-- jest wysyłany push-em przez edge fn send-web-push (cron co minutę), znacznik notifications.push_sent_at.

create table if not exists market.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failures int not null default 0
);
create index if not exists push_subscriptions_user_idx on market.push_subscriptions(user_id);
alter table market.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on market.push_subscriptions;
create policy push_subscriptions_own on market.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table market.notifications add column if not exists push_sent_at timestamptz;
create index if not exists notifications_push_pending_idx on market.notifications(created_at) where push_sent_at is null;

-- Publiczny klucz VAPID (anon może pobrać — jest publiczny z definicji).
create or replace function market.push_public_key() returns text
language sql stable security definer set search_path to 'market' as $$
  select value from market.internal_secrets where key = 'vapid_public_key';
$$;
grant execute on function market.push_public_key() to anon, authenticated;

create or replace function market.save_push_subscription(p_sub jsonb, p_user_agent text default null) returns void
language plpgsql security definer set search_path to 'market' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Zaloguj się'; end if;
  if coalesce(p_sub->>'endpoint','') = '' or coalesce(p_sub#>>'{keys,p256dh}','') = '' or coalesce(p_sub#>>'{keys,auth}','') = '' then
    raise exception 'Nieprawidłowa subskrypcja push';
  end if;
  insert into market.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_sub->>'endpoint', p_sub#>>'{keys,p256dh}', p_sub#>>'{keys,auth}', left(p_user_agent, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now(), failures = 0;
end; $$;
grant execute on function market.save_push_subscription(jsonb, text) to authenticated;

create or replace function market.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path to 'market' as $$
  delete from market.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
grant execute on function market.remove_push_subscription(text) to authenticated;

-- Cron: co minutę wysyłka oczekujących powiadomień push (edge fn bez JWT, jak verify-sweeper).
select cron.unschedule(jobid) from cron.job where jobname = 'market-send-web-push';
select cron.schedule('market-send-web-push', '* * * * *', $$
  select net.http_post(
    url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/send-web-push',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
