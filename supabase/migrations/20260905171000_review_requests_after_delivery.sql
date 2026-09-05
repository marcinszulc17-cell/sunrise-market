-- Prawdziwe opinie zamiast wymyślonych (2026-09-05): po doręczeniu / zakończeniu zamówienia kupujący dostaje
-- prośbę o ocenę każdej kupionej pozycji — in-app (market.notifications) + e-mail (booking_mail_outbox 'generic').
-- Ocena trafia przez istniejące add_review_simple (strona produktu → „Oceń zakup”) do market.reviews i buduje
-- reputację sprzedawcy (offer_reviews / seller_reputation). Jedna prośba na zamówienie (dedupe po event_key).
create or replace function market.request_reviews_after_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_lines text[] := '{}'; v_first uuid; v_title text; r record; v_n int := 0;
begin
  if new.status not in ('delivered','completed') or coalesce(old.status,'') in ('delivered','completed') then return new; end if;
  if new.buyer_id is null then return new; end if;
  select u.email into v_email from auth.users u where u.id = new.buyer_id;
  for r in select distinct oi.offer_id, o.title from market.order_items oi join market.offers o on o.id = oi.offer_id where oi.order_id = new.id
  loop
    v_n := v_n + 1;
    if v_first is null then v_first := r.offer_id; v_title := r.title; end if;
    v_lines := v_lines || ('• '||coalesce(r.title,'')||' — https://sunrisemarket.pl/produkt/'||r.offer_id::text||'#opinia');
  end loop;
  if v_n = 0 then return new; end if;
  perform market.notify_once(new.buyer_id, 'review_request', 'Jak oceniasz zakup?',
    case when v_n = 1 then 'Oceń „'||coalesce(v_title,'')||'” — Twoja opinia pomaga innym klientom i sprzedawcy.'
         else 'Oceń '||v_n||' kupione pozycje — Twoja opinia pomaga innym klientom i sprzedawcom.' end,
    'review_request:'||new.id::text);
  perform market.enqueue_mail(v_email, 'buyer', 'review_request:'||new.id::text,
    'Jak oceniasz zakup w Sunrise Market?', 'Podziel się opinią',
    array['Twoje zamówienie zostało doręczone. Oceń zakup w skali 1–5 i napisz kilka słów — publikujemy wyłącznie opinie klientów, którzy naprawdę kupili produkt.'] || v_lines,
    'Oceń zakup', 'https://sunrisemarket.pl/produkt/'||v_first::text||'#opinia');
  return new;
exception when others then
  raise warning 'request_reviews_after_delivery failed for %: %', new.id, sqlerrm; return new;
end; $$;
drop trigger if exists trg_request_reviews_after_delivery on market.orders;
create trigger trg_request_reviews_after_delivery after update of status on market.orders
for each row execute function market.request_reviews_after_delivery();

-- Opinia tylko od kupującego: add_review_simple wymaga opłaconego zamówienia z tą ofertą (wcześniej mógł ocenić każdy zalogowany).
create or replace function market.add_review_simple(p_offer uuid, p_rating integer, p_comment text)
returns void language plpgsql security definer set search_path to 'market','public' as $$
declare v_email text := auth.jwt() ->> 'email'; v_seller uuid; v_uid uuid := auth.uid();
begin
  if v_email is null then raise exception 'Zaloguj się, aby dodać opinię'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Ocena 1-5'; end if;
  select seller_id into v_seller from market.offers where id = p_offer;
  if v_seller is null then raise exception 'Brak oferty'; end if;
  if not exists (
    select 1 from market.order_items oi join market.orders o on o.id = oi.order_id
    where oi.offer_id = p_offer and o.buyer_id = v_uid and o.status in ('paid','shipped','delivered','completed')
  ) then raise exception 'Opinię może dodać tylko klient, który kupił ten produkt'; end if;
  if exists (select 1 from market.reviews where offer_id = p_offer and buyer_id = v_uid) then
    update market.reviews set rating = p_rating, comment = nullif(p_comment,''), created_at = now()
      where offer_id = p_offer and buyer_id = v_uid;
  else
    insert into market.reviews(offer_id, buyer_id, seller_id, rating, comment)
      values (p_offer, v_uid, v_seller, p_rating, nullif(p_comment,''));
  end if;
end; $$;
