-- 2026-09-06: pełna treść zaakceptowanej umowy najmu zapisana w bazie (weryfikacja sha256 po stronie serwera)
-- i wysyłana e-mailem obu stronom po opłaceniu rezerwacji (trigger na bookings.paid_at).
alter table market.booking_agreements add column if not exists agreement_text text;

create or replace function market.accept_rental_agreement(p_booking uuid, p_version text, p_sha256 text, p_renter jsonb, p_user_agent text default null, p_text text default null)
returns timestamptz language plpgsql security definer set search_path to '' as $$
declare b market.bookings%rowtype; v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  select * into b from market.bookings where id = p_booking;
  if b.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if b.buyer_id <> auth.uid() then raise exception 'Brak dostępu'; end if;
  if b.booking_type <> 'daily' then raise exception 'Umowa dotyczy wynajmu na dni'; end if;
  if b.paid_at is not null then raise exception 'Rezerwacja jest już opłacona — umowa została zaakceptowana wcześniej'; end if;
  if coalesce(trim(p_renter->>'full_name'),'') = '' or coalesce(trim(p_renter->>'phone'),'') = '' or coalesce(trim(p_renter->>'doc_number'),'') = '' then
    raise exception 'Podaj imię i nazwisko, telefon oraz numer dokumentu';
  end if;
  if coalesce(p_version,'') = '' or length(coalesce(p_sha256,'')) <> 64 then raise exception 'Nieprawidłowa wersja umowy'; end if;
  if p_text is not null and encode(extensions.digest(convert_to(p_text,'UTF8'),'sha256'),'hex') <> lower(p_sha256) then
    raise exception 'Treść umowy nie zgadza się z odciskiem — odśwież stronę i spróbuj ponownie';
  end if;
  insert into market.booking_agreements(booking_id, buyer_id, version, text_sha256, renter, accepted_at, user_agent, agreement_text)
  values (b.id, auth.uid(), p_version, lower(p_sha256), p_renter, now(), left(p_user_agent, 400), p_text)
  on conflict (booking_id) do update set version = excluded.version, text_sha256 = excluded.text_sha256, renter = excluded.renter, accepted_at = now(), user_agent = excluded.user_agent, agreement_text = excluded.agreement_text
  returning accepted_at into v_at;
  return v_at;
end $$;
revoke all on function market.accept_rental_agreement(uuid,text,text,jsonb,text,text) from public, anon;
grant execute on function market.accept_rental_agreement(uuid,text,text,jsonb,text,text) to authenticated, service_role;
drop function if exists market.accept_rental_agreement(uuid,text,text,jsonb,text);

create or replace function market.my_rental_agreement(p_booking uuid)
returns table(booking_id uuid, version text, text_sha256 text, renter jsonb, accepted_at timestamptz, agreement_text text)
language sql security definer set search_path to '' stable as $$
  select a.booking_id, a.version, a.text_sha256, a.renter, a.accepted_at, a.agreement_text
  from market.booking_agreements a join market.bookings b on b.id = a.booking_id
  where a.booking_id = p_booking and (b.buyer_id = auth.uid() or b.seller_id = market.current_seller_id() or market.is_operator());
$$;

-- E-mail z umową po opłaceniu (obie strony), raz na rezerwację
create or replace function market.send_rental_agreement_mail(p_booking uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare a market.booking_agreements%rowtype; b market.bookings%rowtype; v_title text; v_seller_email text; v_buyer_email text; v_lines text[];
begin
  select * into a from market.booking_agreements where booking_id = p_booking;
  if a.booking_id is null or a.agreement_text is null then return; end if;
  select * into b from market.bookings where id = p_booking;
  select o.title, s.email into v_title, v_seller_email from market.offers o join market.sellers s on s.id = o.seller_id where o.id = b.offer_id;
  select u.email::text into v_buyer_email from auth.users u where u.id = b.buyer_id;
  v_lines := array_cat(array['Umowa zaakceptowana ' || to_char(a.accepted_at at time zone 'Europe/Warsaw', 'DD.MM.YYYY HH24:MI') || ' (wersja ' || a.version || ', odcisk SHA-256: ' || a.text_sha256 || ').', ''],
                       string_to_array(a.agreement_text, E'\n'));
  perform market.enqueue_mail(v_buyer_email, 'buyer', 'rental_agreement:' || p_booking::text, 'Umowa najmu — ' || v_title, 'Twoja umowa najmu', v_lines, 'Otwórz rezerwację', 'https://app.sunrisemarket.pl/rezerwacje');
  perform market.enqueue_mail(v_seller_email, 'seller', 'rental_agreement:' || p_booking::text, 'Umowa najmu — ' || v_title, 'Umowa najmu z klientem', v_lines, 'Panel rezerwacji', 'https://app.sunrisemarket.pl/sprzedawca/rezerwacje');
end $$;
revoke all on function market.send_rental_agreement_mail(uuid) from public, anon, authenticated;

create or replace function market.trg_booking_paid_agreement_mail() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.paid_at is not null and old.paid_at is null and new.booking_type = 'daily' then perform market.send_rental_agreement_mail(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_booking_paid_agreement_mail on market.bookings;
create trigger trg_booking_paid_agreement_mail after update of paid_at on market.bookings for each row execute function market.trg_booking_paid_agreement_mail();
