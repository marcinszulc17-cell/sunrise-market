-- 2026-09-06 (decyzja właściciela): protokół wydania/zwrotu ma być spięty z systemem rezerwacji „jak w zegarku”.
--  • market.rental_protocol_event(booking, event) — powiadomienie in-app (notify_once) + e-mail (enqueue_mail) do właściwej strony,
--    wołane przez edge fn booking-protocol po zapisie wydania/zwrotu, odpowiedzi klienta i zdjęciach klienta.
--  • market.rental_protocol_tick() — cron co 15 min: przypomnienia „dziś wydanie / dziś zwrot” (2 h przed), alarm gdy protokół
--    wydania nie powstał 3 h po starcie, przypomnienie sprzedawcy o kaucji 24 h po zwrocie, auto-zakończenie najmu po zwrocie.
create or replace function market.rental_protocol_event(p_booking uuid, p_event text)
returns void language plpgsql security definer set search_path to '' as $$
declare
  b market.bookings%rowtype;
  v_title text; v_seller_user uuid; v_seller_email text; v_buyer_email text;
  v_when text; v_url_buyer text := 'https://app.sunrisemarket.pl/rezerwacje'; v_url_seller text := 'https://app.sunrisemarket.pl/sprzedawca/rezerwacje';
  v_key text;
begin
  select * into b from market.bookings where id = p_booking;
  if b.id is null or b.booking_type <> 'daily' then return; end if;
  select o.title, s.auth_user_id, s.email into v_title, v_seller_user, v_seller_email
    from market.offers o join market.sellers s on s.id = o.seller_id where o.id = b.offer_id;
  select u.email::text into v_buyer_email from auth.users u where u.id = b.buyer_id;
  v_when := to_char(b.starts_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI') || ' → ' || to_char(b.ends_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI');
  v_key := 'rental:' || p_event || ':' || b.id::text;

  if p_event = 'handover_due' then
    perform market.notify_once(b.buyer_id, 'booking', 'Dziś odbiór: ' || v_title, 'Przy odbiorze zrób własne zdjęcia w protokole (aparatem, na miejscu) i potwierdź stan. Termin: ' || v_when, v_key || ':buyer');
    perform market.enqueue_mail(v_buyer_email, 'buyer', v_key || ':buyer', 'Dziś odbiór — ' || v_title, 'Dziś odbierasz: ' || v_title,
      array['Termin: ' || v_when, 'Przy odbiorze sprzedawca zapisze protokół wydania ze zdjęciami. Zrób też własne zdjęcia w aplikacji — dostaną pieczęć czasu serwera.', 'Potem potwierdź stan albo zgłoś zastrzeżenie — to chroni Twoją kaucję.'], 'Otwórz rezerwację', v_url_buyer);
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Dziś wydanie: ' || v_title, 'Zrób zdjęcia aparatem w chwili wydania i zapisz protokół. Bez zdjęć protokół się nie zapisze. Termin: ' || v_when, v_key || ':seller'); end if;
    perform market.enqueue_mail(v_seller_email, 'seller', v_key || ':seller', 'Dziś wydanie — ' || v_title, 'Dziś wydajesz: ' || v_title,
      array['Termin: ' || v_when, 'W panelu „Wydania i zwroty” zrób zdjęcia aparatem w chwili wydania (przebieg, paliwo, każda strona, wnętrze) i zapisz protokół.', 'Klient dostanie prośbę o potwierdzenie stanu.'], 'Panel wydań i zwrotów', v_url_seller);

  elsif p_event = 'return_due' then
    perform market.notify_once(b.buyer_id, 'booking', 'Dziś zwrot: ' || v_title, 'Przy zwrocie zrób własne zdjęcia w protokole i potwierdź stan. Koniec najmu: ' || to_char(b.ends_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI'), v_key || ':buyer');
    perform market.enqueue_mail(v_buyer_email, 'buyer', v_key || ':buyer', 'Dziś zwrot — ' || v_title, 'Dziś zwracasz: ' || v_title,
      array['Koniec najmu: ' || to_char(b.ends_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI'), 'Zrób własne zdjęcia przy zwrocie i potwierdź protokół zwrotu — po nim sprzedawca rozlicza kaucję.'], 'Otwórz rezerwację', v_url_buyer);
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Dziś zwrot: ' || v_title, 'Zrób zdjęcia aparatem w chwili zwrotu, zapisz protokół zwrotu i rozlicz kaucję.', v_key || ':seller'); end if;
    perform market.enqueue_mail(v_seller_email, 'seller', v_key || ':seller', 'Dziś zwrot — ' || v_title, 'Dziś odbierasz zwrot: ' || v_title,
      array['Koniec najmu: ' || to_char(b.ends_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI'), 'Zdjęcia aparatem przy zwrocie → protokół zwrotu → rozliczenie kaucji (zwrot / potrącenie z uzasadnieniem).'], 'Panel wydań i zwrotów', v_url_seller);

  elsif p_event = 'handover_missing' then
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Brak protokołu wydania: ' || v_title, 'Najem trwa od ' || to_char(b.starts_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI') || ', a protokół wydania ze zdjęciami nie został zapisany. Bez niego potrącenie kaucji będzie zablokowane.', v_key); end if;
    perform market.enqueue_mail(v_seller_email, 'seller', v_key, 'Brak protokołu wydania — ' || v_title, 'Protokół wydania nie został zapisany', array['Najem: ' || v_when, 'Zapisz protokół wydania ze zdjęciami jak najszybciej — chroni Cię przy sporze o stan.'], 'Panel wydań i zwrotów', v_url_seller);

  elsif p_event = 'handover_saved' then
    perform market.notify_once(b.buyer_id, 'booking', 'Protokół wydania do potwierdzenia: ' || v_title, 'Sprzedawca zapisał stan przy wydaniu. Sprawdź zdjęcia i potwierdź albo zgłoś zastrzeżenie.', v_key);
    perform market.enqueue_mail(v_buyer_email, 'buyer', v_key, 'Potwierdź protokół wydania — ' || v_title, 'Protokół wydania czeka na Twoje potwierdzenie', array['Sprzedawca zapisał stan i zdjęcia przy wydaniu.', 'Sprawdź je i kliknij „Potwierdzam stan” albo „Mam zastrzeżenie”.'], 'Otwórz protokół', v_url_buyer);

  elsif p_event = 'return_saved' then
    perform market.notify_once(b.buyer_id, 'booking', 'Protokół zwrotu do potwierdzenia: ' || v_title, 'Sprzedawca zapisał stan przy zwrocie. Potwierdź albo zgłoś zastrzeżenie — potem rozliczana jest kaucja.', v_key);
    perform market.enqueue_mail(v_buyer_email, 'buyer', v_key, 'Potwierdź protokół zwrotu — ' || v_title, 'Protokół zwrotu czeka na Twoje potwierdzenie', array['Sprzedawca zapisał stan i zdjęcia przy zwrocie.', 'Po Twojej odpowiedzi sprzedawca rozlicza kaucję.'], 'Otwórz protokół', v_url_buyer);

  elsif p_event in ('handover_ack','return_ack') then
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Klient potwierdził ' || case when p_event='handover_ack' then 'wydanie' else 'zwrot' end || ': ' || v_title, 'Etap jest zamrożony. ' || case when p_event='return_ack' then 'Możesz rozliczyć kaucję.' else '' end, v_key); end if;

  elsif p_event in ('handover_dispute','return_dispute') then
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Zastrzeżenie klienta do ' || case when p_event='handover_dispute' then 'wydania' else 'zwrotu' end || ': ' || v_title, 'Sprawdź uwagę klienta w panelu „Wydania i zwroty” i popraw protokół albo odpowiedz w wiadomościach.', v_key); end if;
    perform market.enqueue_mail(v_seller_email, 'seller', v_key, 'Zastrzeżenie klienta — ' || v_title, 'Klient zgłosił zastrzeżenie do protokołu', array['Otwórz panel „Wydania i zwroty”, przeczytaj uwagę i popraw protokół lub odpowiedz klientowi.'], 'Panel wydań i zwrotów', v_url_seller);

  elsif p_event in ('buyer_photos_handover','buyer_photos_return') then
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Klient dodał zdjęcia: ' || v_title, 'Klient zrobił własne zdjęcia przy ' || case when p_event='buyer_photos_handover' then 'odbiorze' else 'zwrocie' end || '. Zobacz je w protokole.', v_key); end if;

  elsif p_event = 'deposit_pending' then
    if v_seller_user is not null then perform market.notify_once(v_seller_user, 'booking', 'Rozlicz kaucję: ' || v_title, 'Zwrot zapisany, a kaucja ' || to_char(coalesce(b.deposit_gross,0), 'FM999G999D00') || ' zł nadal czeka. Zwróć ją albo potrąć z uzasadnieniem.', v_key); end if;
    perform market.enqueue_mail(v_seller_email, 'seller', v_key, 'Rozlicz kaucję — ' || v_title, 'Kaucja czeka na rozliczenie', array['Protokół zwrotu jest zapisany od ponad doby.', 'Zwróć kaucję albo potrąć część/całość z uzasadnieniem — klient widzi decyzję w aplikacji.'], 'Panel wydań i zwrotów', v_url_seller);
  end if;
end $$;
revoke all on function market.rental_protocol_event(uuid,text) from public, anon, authenticated;
grant execute on function market.rental_protocol_event(uuid,text) to service_role;

create or replace function market.rental_protocol_tick()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0;
begin
  -- 2 h przed startem: „dziś wydanie/odbiór”
  for r in select b.id from market.bookings b where b.booking_type='daily' and b.status='confirmed' and b.paid_at is not null
             and b.starts_at between now() and now() + interval '2 hours'
  loop perform market.rental_protocol_event(r.id, 'handover_due'); n := n + 1; end loop;
  -- 2 h przed końcem: „dziś zwrot”
  for r in select b.id from market.bookings b where b.booking_type='daily' and b.status='confirmed' and b.paid_at is not null
             and b.ends_at between now() and now() + interval '2 hours'
  loop perform market.rental_protocol_event(r.id, 'return_due'); n := n + 1; end loop;
  -- 3 h po starcie bez protokołu wydania
  for r in select b.id from market.bookings b left join market.booking_handover_protocols p on p.booking_id=b.id
            where b.booking_type='daily' and b.status='confirmed' and b.paid_at is not null
              and b.starts_at between now() - interval '27 hours' and now() - interval '3 hours' and p.handover_at is null
  loop perform market.rental_protocol_event(r.id, 'handover_missing'); n := n + 1; end loop;
  -- zwrot zapisany → najem zakończony (jak w zegarku, bez klikania)
  update market.bookings b set status='completed', updated_at=now()
    from market.booking_handover_protocols p
   where p.booking_id=b.id and p.return_at is not null and b.booking_type='daily' and b.status='confirmed';
  -- 24 h po zwrocie kaucja nadal trzymana
  for r in select b.id from market.bookings b join market.booking_handover_protocols p on p.booking_id=b.id
            where b.booking_type='daily' and coalesce(b.deposit_gross,0) > 0 and b.deposit_status in ('held','failed')
              and p.return_at between now() - interval '7 days' and now() - interval '24 hours'
  loop perform market.rental_protocol_event(r.id, 'deposit_pending'); n := n + 1; end loop;
  return n;
end $$;
revoke all on function market.rental_protocol_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'market-rental-protocol-tick';
select cron.schedule('market-rental-protocol-tick', '*/15 * * * *', 'select market.rental_protocol_tick();');
