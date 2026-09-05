-- 2026-09-06: kod potwierdzenia wydania/zwrotu idzie też SMS-em (SMSAPI przez hub MySunrise: edge fn mkt-sms,
-- auth X-Sunrise-Service-Token = market.internal_secrets.sunrise_pay_service_token). Numer: booking_agreements.renter.phone.
-- Wysyłka asynchroniczna przez pg_net — nie blokuje wydania kodu; brak numeru = tylko in-app + e-mail.
create or replace function market.send_market_sms(p_phone text, p_body text, p_kind text default 'notice')
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_token text; v_phone text;
begin
  v_phone := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  if length(v_phone) < 9 then return null; end if;
  select value into v_token from market.internal_secrets where key = 'sunrise_pay_service_token';
  if v_token is null then return null; end if;
  return net.http_post(
    url := 'https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1/mkt-sms',
    headers := jsonb_build_object('Content-Type','application/json','X-Sunrise-Service-Token', v_token),
    body := jsonb_build_object('phone', v_phone, 'body', left(p_body, 320), 'trigger', case when p_kind = 'code' then 'code' else 'notice' end)
  );
end $$;
revoke all on function market.send_market_sms(text,text,text) from public, anon, authenticated;

create or replace function market.issue_handover_code(p_booking uuid, p_phase text)
returns text language plpgsql security definer set search_path to '' as $$
declare b market.bookings%rowtype; v_code text; v_title text; v_email text; v_label text; v_phone text;
begin
  select * into b from market.bookings where id = p_booking;
  if b.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if p_phase not in ('handover','return') then raise exception 'Nieprawidłowy etap'; end if;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update market.booking_handover_codes set expires_at = now() where booking_id = p_booking and phase = p_phase and verified_at is null;
  insert into market.booking_handover_codes(booking_id, phase, code) values (p_booking, p_phase, v_code);
  select o.title into v_title from market.offers o where o.id = b.offer_id;
  select u.email::text into v_email from auth.users u where u.id = b.buyer_id;
  select a.renter->>'phone' into v_phone from market.booking_agreements a where a.booking_id = p_booking;
  v_label := case when p_phase = 'handover' then 'odbioru' else 'zwrotu' end;
  perform market.notify_once(b.buyer_id, 'booking', 'Kod potwierdzenia ' || v_label || ': ' || v_code, 'Podaj ten kod sprzedawcy przy ' || v_label || ' (' || v_title || '). Ważny 15 minut.', 'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code);
  perform market.enqueue_mail(v_email, 'buyer', 'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code, 'Kod potwierdzenia ' || v_label || ' — ' || v_title, 'Twój kod: ' || v_code,
    array['Podaj ten kod sprzedawcy przy ' || v_label || ' przedmiotu najmu. Kod jest ważny 15 minut i potwierdza, że to Ty odbierasz/zwracasz.', 'Jeśli nie jesteś teraz przy ' || v_label || ', zignoruj tę wiadomość i skontaktuj się ze sprzedawcą.'], 'Otwórz rezerwację', 'https://app.sunrisemarket.pl/rezerwacje');
  -- SMS bez polskich znaków (1 segment GSM)
  perform market.send_market_sms(v_phone, 'Sunrise Market: kod ' || (case when p_phase = 'handover' then 'odbioru' else 'zwrotu' end) || ' ' || v_code || '. Podaj go sprzedawcy. Wazny 15 min.', 'code');
  return v_code;
end $$;

-- Deduplikacja SMS-ów (przypomnienia „dziś odbiór/zwrot”): market.sms_log + send_market_sms_once; rental_protocol_tick wysyła SMS
-- do najemcy (renter.phone) 2 h przed startem i przed końcem najmu. (Zastosowane na produkcji 2026-09-06 jako sms_log_dedupe.)
create table if not exists market.sms_log (dedupe_key text primary key, phone text, body text, request_id bigint, created_at timestamptz not null default now());
alter table market.sms_log enable row level security;
revoke all on table market.sms_log from anon, authenticated;
create or replace function market.send_market_sms_once(p_key text, p_phone text, p_body text, p_kind text default 'notice')
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  if exists (select 1 from market.sms_log where dedupe_key = p_key) then return false; end if;
  v_id := market.send_market_sms(p_phone, p_body, p_kind);
  if v_id is null then return false; end if;
  insert into market.sms_log(dedupe_key, phone, body, request_id) values (p_key, p_phone, p_body, v_id) on conflict do nothing;
  return true;
end $$;
revoke all on function market.send_market_sms_once(text,text,text,text) from public, anon, authenticated;
-- rental_protocol_tick: patrz wersja z send_market_sms_once (handover_due / return_due) — pełna definicja w bazie.
