-- 2026-09-06: „podpis kodem” przy wydaniu/zwrocie — dowód, że osoba przy aucie to klient.
-- Sprzedawca prosi o kod → klient dostaje 6 cyfr (in-app + e-mail; SMS po podaniu bramki przez właściciela) → sprzedawca wpisuje kod
-- w protokole → zapis handover_code_verified_at / return_code_verified_at. Kod ważny 15 min, 5 prób.
create table if not exists market.booking_handover_codes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references market.bookings(id) on delete cascade,
  phase text not null check (phase in ('handover','return')),
  code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  attempts integer not null default 0,
  verified_at timestamptz
);
create index if not exists booking_handover_codes_booking_idx on market.booking_handover_codes(booking_id, phase, created_at desc);
alter table market.booking_handover_codes enable row level security;
revoke all on table market.booking_handover_codes from anon, authenticated;
grant select, insert, update, delete on table market.booking_handover_codes to service_role;

alter table market.booking_handover_protocols
  add column if not exists handover_code_verified_at timestamptz,
  add column if not exists return_code_verified_at timestamptz;

-- Wygenerowanie kodu i powiadomienie klienta (wołane przez edge fn booking-protocol z rolą service)
create or replace function market.issue_handover_code(p_booking uuid, p_phase text)
returns text language plpgsql security definer set search_path to '' as $$
declare b market.bookings%rowtype; v_code text; v_title text; v_email text; v_label text;
begin
  select * into b from market.bookings where id = p_booking;
  if b.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if p_phase not in ('handover','return') then raise exception 'Nieprawidłowy etap'; end if;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update market.booking_handover_codes set expires_at = now() where booking_id = p_booking and phase = p_phase and verified_at is null;
  insert into market.booking_handover_codes(booking_id, phase, code) values (p_booking, p_phase, v_code);
  select o.title into v_title from market.offers o where o.id = b.offer_id;
  select u.email::text into v_email from auth.users u where u.id = b.buyer_id;
  v_label := case when p_phase = 'handover' then 'odbioru' else 'zwrotu' end;
  perform market.notify_once(b.buyer_id, 'booking', 'Kod potwierdzenia ' || v_label || ': ' || v_code, 'Podaj ten kod sprzedawcy przy ' || v_label || ' (' || v_title || '). Ważny 15 minut.', 'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code);
  perform market.enqueue_mail(v_email, 'buyer', 'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code, 'Kod potwierdzenia ' || v_label || ' — ' || v_title, 'Twój kod: ' || v_code,
    array['Podaj ten kod sprzedawcy przy ' || v_label || ' przedmiotu najmu. Kod jest ważny 15 minut i potwierdza, że to Ty odbierasz/zwracasz.', 'Jeśli nie jesteś teraz przy ' || v_label || ', zignoruj tę wiadomość i skontaktuj się ze sprzedawcą.'], 'Otwórz rezerwację', 'https://app.sunrisemarket.pl/rezerwacje');
  return v_code;
end $$;
revoke all on function market.issue_handover_code(uuid,text) from public, anon, authenticated;
grant execute on function market.issue_handover_code(uuid,text) to service_role;

-- Weryfikacja kodu przez sprzedawcę
create or replace function market.verify_handover_code(p_booking uuid, p_phase text, p_code text)
returns text language plpgsql security definer set search_path to '' as $$
declare c market.booking_handover_codes%rowtype;
begin
  select * into c from market.booking_handover_codes where booking_id = p_booking and phase = p_phase and verified_at is null order by created_at desc limit 1;
  if c.id is null then return 'no_code'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many_attempts'; end if;
  if c.code <> regexp_replace(coalesce(p_code,''), '\D', '', 'g') then
    update market.booking_handover_codes set attempts = attempts + 1 where id = c.id;
    return 'wrong_code';
  end if;
  update market.booking_handover_codes set verified_at = now() where id = c.id;
  if p_phase = 'handover' then
    update market.booking_handover_protocols set handover_code_verified_at = now(), updated_at = now() where booking_id = p_booking;
  else
    update market.booking_handover_protocols set return_code_verified_at = now(), updated_at = now() where booking_id = p_booking;
  end if;
  return 'ok';
end $$;
revoke all on function market.verify_handover_code(uuid,text,text) from public, anon, authenticated;
grant execute on function market.verify_handover_code(uuid,text,text) to service_role;

-- Aktywny kod dla klienta (do pokazania w aplikacji)
create or replace function market.active_handover_code(p_booking uuid, p_phase text)
returns table(code text, expires_at timestamptz) language sql security definer set search_path to '' stable as $$
  select c.code, c.expires_at from market.booking_handover_codes c join market.bookings b on b.id = c.booking_id
  where c.booking_id = p_booking and c.phase = p_phase and c.verified_at is null and c.expires_at > now() and b.buyer_id = auth.uid()
  order by c.created_at desc limit 1;
$$;
revoke all on function market.active_handover_code(uuid,text) from public, anon;
grant execute on function market.active_handover_code(uuid,text) to authenticated, service_role;
