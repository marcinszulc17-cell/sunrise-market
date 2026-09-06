-- Naprawy z testu end-to-end wynajmu (2026-09-06):
-- 1) verify_handover_link (QR „/odbior/:token”) wywalał się na
--    „column reference "booking_id" is ambiguous” — parametr OUT kolidował
--    z kolumną w ON CONFLICT (booking_id). Cały odbiór przez QR nie działał.
-- 2) verify_handover_code zapisywał potwierdzenie kodu do protokołu, który
--    mógł jeszcze nie istnieć — potwierdzenie przepadało po cichu.
-- 3) Odmiana w powiadomieniach: „przy zwrotu/odbioru” → „przy zwrocie/odbiorze”.

create or replace function market.verify_handover_link(p_token text)
returns table(booking_id uuid, phase text, status text)
language plpgsql security definer set search_path = market, public, extensions
as $$
#variable_conflict use_column
declare c market.booking_handover_codes%rowtype; b market.bookings%rowtype;
begin
  select * into c from market.booking_handover_codes t where t.link_token = p_token;
  if c.id is null then return query select null::uuid, null::text, 'not_found'::text; return; end if;
  select * into b from market.bookings t where t.id = c.booking_id;
  if b.buyer_id is distinct from auth.uid() then return query select c.booking_id, c.phase, 'not_yours'::text; return; end if;
  if c.verified_at is not null then return query select c.booking_id, c.phase, 'ok'::text; return; end if;
  if c.expires_at < now() then return query select c.booking_id, c.phase, 'expired'::text; return; end if;
  update market.booking_handover_codes t set verified_at = now() where t.id = c.id;
  if not exists (select 1 from market.booking_handover_protocols p where p.booking_id = b.id) then
    insert into market.booking_handover_protocols (booking_id, seller_id, buyer_id, resource_id, created_by, updated_by)
      values (b.id, b.seller_id, b.buyer_id, b.resource_id, auth.uid(), auth.uid());
  end if;
  if c.phase = 'handover' then
    update market.booking_handover_protocols p set handover_code_verified_at = now(), updated_at = now() where p.booking_id = b.id;
  else
    update market.booking_handover_protocols p set return_code_verified_at = now(), updated_at = now() where p.booking_id = b.id;
  end if;
  return query select c.booking_id, c.phase, 'ok'::text;
end $$;

grant execute on function market.verify_handover_link(text) to authenticated;

create or replace function market.verify_handover_code(p_booking uuid, p_phase text, p_code text)
returns text
language plpgsql security definer set search_path = market, public, extensions
as $$
declare c market.booking_handover_codes%rowtype; b market.bookings%rowtype;
begin
  select * into c from market.booking_handover_codes t
   where t.booking_id = p_booking and t.phase = p_phase and t.verified_at is null
   order by t.created_at desc limit 1;
  if c.id is null then return 'no_code'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many_attempts'; end if;
  if c.code <> regexp_replace(coalesce(p_code,''), '\D', '', 'g') then
    update market.booking_handover_codes t set attempts = t.attempts + 1 where t.id = c.id;
    return 'wrong_code';
  end if;
  update market.booking_handover_codes t set verified_at = now() where t.id = c.id;
  select * into b from market.bookings t where t.id = p_booking;
  if not exists (select 1 from market.booking_handover_protocols p where p.booking_id = b.id) then
    insert into market.booking_handover_protocols (booking_id, seller_id, buyer_id, resource_id, created_by, updated_by)
      values (b.id, b.seller_id, b.buyer_id, b.resource_id, b.buyer_id, b.buyer_id);
  end if;
  if p_phase = 'handover' then
    update market.booking_handover_protocols p set handover_code_verified_at = now(), updated_at = now() where p.booking_id = p_booking;
  else
    update market.booking_handover_protocols p set return_code_verified_at = now(), updated_at = now() where p.booking_id = p_booking;
  end if;
  return 'ok';
end $$;

create or replace function market.issue_handover_code(p_booking uuid, p_phase text)
returns text
language plpgsql security definer set search_path = market, public, extensions
as $$
declare b market.bookings%rowtype; v_code text; v_title text; v_email text; v_gen text; v_loc text; v_phone text;
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
  v_gen := case when p_phase = 'handover' then 'odbioru' else 'zwrotu' end;
  v_loc := case when p_phase = 'handover' then 'odbiorze' else 'zwrocie' end;
  perform market.notify_once(b.buyer_id, 'booking', 'Kod potwierdzenia ' || v_gen || ': ' || v_code,
    'Podaj ten kod sprzedawcy przy ' || v_loc || ' (' || v_title || '). Ważny 15 minut.',
    'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code);
  perform market.enqueue_mail(v_email, 'buyer', 'handover_code:' || p_booking::text || ':' || p_phase || ':' || v_code,
    'Kod potwierdzenia ' || v_gen || ' — ' || v_title, 'Twój kod: ' || v_code,
    array['Podaj ten kod sprzedawcy przy ' || v_loc || ' przedmiotu najmu. Kod jest ważny 15 minut i potwierdza, że to Ty odbierasz/zwracasz.',
          'Jeśli nie jesteś teraz przy ' || v_loc || ', zignoruj tę wiadomość i skontaktuj się ze sprzedawcą.'],
    'Otwórz rezerwację', 'https://app.sunrisemarket.pl/rezerwacje');
  perform market.send_market_sms(v_phone, 'Sunrise Market: kod ' || v_gen || ' ' || v_code || '. Podaj go sprzedawcy. Wazny 15 min.', 'code');
  return v_code;
end $$;
