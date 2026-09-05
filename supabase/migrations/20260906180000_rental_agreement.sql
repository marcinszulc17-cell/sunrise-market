-- 2026-09-06 (decyzja właściciela): rygorystyczna umowa najmu akceptowana NA POCZĄTKU — w momencie zapłaty z góry razem z kaucją.
-- Klient przed płatnością podaje dane najemcy/kierowcy i akceptuje treść umowy (wersja + sha256 treści). Bez akceptacji
-- checkout rezerwacji dobowej jest zablokowany (edge fn checkout). Treść umowy: src/lib/rentalAgreement.ts (ta sama wersja).
create table if not exists market.booking_agreements (
  booking_id uuid primary key references market.bookings(id) on delete cascade,
  buyer_id uuid not null,
  version text not null,
  text_sha256 text not null,
  renter jsonb not null default '{}'::jsonb,   -- {full_name, phone, doc_type, doc_number, license_number, license_since_year, address}
  accepted_at timestamptz not null default now(),
  user_agent text
);
alter table market.booking_agreements enable row level security;
revoke all on table market.booking_agreements from anon, authenticated;
grant select, insert, update, delete on table market.booking_agreements to service_role;

create or replace function market.accept_rental_agreement(p_booking uuid, p_version text, p_sha256 text, p_renter jsonb, p_user_agent text default null)
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
  insert into market.booking_agreements(booking_id, buyer_id, version, text_sha256, renter, accepted_at, user_agent)
  values (b.id, auth.uid(), p_version, lower(p_sha256), p_renter, now(), left(p_user_agent, 400))
  on conflict (booking_id) do update set version = excluded.version, text_sha256 = excluded.text_sha256, renter = excluded.renter, accepted_at = now(), user_agent = excluded.user_agent
  returning accepted_at into v_at;
  return v_at;
end $$;
revoke all on function market.accept_rental_agreement(uuid,text,text,jsonb,text) from public, anon;
grant execute on function market.accept_rental_agreement(uuid,text,text,jsonb,text) to authenticated, service_role;

-- Podgląd własnej umowy (klient) / umowy do swojej rezerwacji (sprzedawca) — bez numerów dokumentów dla sprzedawcy? Sprzedawca
-- musi znać dane najemcy (umowa między stronami), więc widzi całość.
create or replace function market.my_rental_agreement(p_booking uuid)
returns table(booking_id uuid, version text, text_sha256 text, renter jsonb, accepted_at timestamptz)
language sql security definer set search_path to '' stable as $$
  select a.booking_id, a.version, a.text_sha256, a.renter, a.accepted_at
  from market.booking_agreements a join market.bookings b on b.id = a.booking_id
  where a.booking_id = p_booking and (b.buyer_id = auth.uid() or b.seller_id = market.current_seller_id() or market.is_operator());
$$;
revoke all on function market.my_rental_agreement(uuid) from public, anon;
grant execute on function market.my_rental_agreement(uuid) to authenticated, service_role;
