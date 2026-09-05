-- Powiadomienia dla użytkowników w różnych formach (decyzja właściciela 2026-09-05):
--   in-app (market.notifications) + e-mail (booking_mail_outbox event 'generic' -> booking-mailer/Resend).
-- 1. Outbox przyjmuje maile ogólne (bez booking_id).
-- 2. market.enqueue_mail(): jedno miejsce kolejkowania maila.
-- 3. Zapytanie od klienta (offer_leads) -> sprzedawca dostaje powiadomienie in-app + e-mail (wcześniej: nic).
-- 4. Zamówienie opłacone -> kupujący i sprzedawca dostają e-mail (obok in-app); tekst o cashbacku tylko gdy był naliczony.
-- 5. Wysyłka zamówienia -> kupujący dostaje in-app + e-mail.

alter table market.booking_mail_outbox alter column booking_id drop not null;
alter table market.booking_mail_outbox drop constraint if exists booking_mail_outbox_event_type_check;
alter table market.booking_mail_outbox add constraint booking_mail_outbox_event_type_check
  check (event_type in ('created','confirmed','cancelled','completed','reminder','rescheduled','generic'));
create unique index if not exists booking_mail_outbox_generic_dedupe
  on market.booking_mail_outbox (event_key, recipient_email) where booking_id is null;

create or replace function market.enqueue_mail(
  p_recipient_email text, p_recipient_type text, p_event_key text,
  p_subject text, p_heading text, p_lines text[], p_cta_label text default null, p_cta_url text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_recipient_email),'') = '' then return; end if;
  insert into market.booking_mail_outbox(booking_id, event_type, recipient_type, recipient_email, event_key, payload, status)
  values (null, 'generic', case when p_recipient_type = 'seller' then 'seller' else 'buyer' end, lower(trim(p_recipient_email)), p_event_key,
          jsonb_build_object('subject', p_subject, 'heading', p_heading, 'lines', to_jsonb(coalesce(p_lines, '{}'::text[])), 'cta_label', p_cta_label, 'cta_url', p_cta_url), 'pending')
  on conflict do nothing;
exception when others then
  raise warning 'enqueue_mail failed (%): %', p_event_key, sqlerrm;
end; $$;
revoke all on function market.enqueue_mail(text,text,text,text,text,text[],text,text) from public;

-- 3. Nowe zapytanie -> sprzedawca
create or replace function market.notify_new_offer_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_seller_email text; v_seller_user uuid; v_title text; v_kind text;
begin
  select s.email into v_seller_email from market.sellers s where s.id = new.seller_id;
  select u.id into v_seller_user from auth.users u where lower(u.email) = lower(v_seller_email) limit 1;
  select o.title into v_title from market.offers o where o.id = new.offer_id;
  v_kind := case coalesce(new.interaction_type,'') when 'appointment' then 'prośba o termin' when 'quote' then 'prośba o wycenę' else 'zapytanie' end;
  if v_seller_user is not null then
    perform market.notify_once(v_seller_user, 'new_lead', 'Nowe zapytanie od klienta',
      'Klient '||coalesce(new.name,'')||' wysłał '||v_kind||' do oferty „'||coalesce(v_title,'')||'”. Odpowiedz w centrum sprzedawcy → Zapytania.',
      'new_lead:'||new.id::text);
  end if;
  perform market.enqueue_mail(v_seller_email, 'seller', 'new_lead:'||new.id::text,
    'Nowe zapytanie: '||coalesce(v_title,'oferta'), 'Masz nowe zapytanie od klienta',
    array['Oferta: '||coalesce(v_title,''), 'Od: '||coalesce(new.name,'')||' · '||coalesce(new.email,'')||' · '||coalesce(new.phone,''), 'Wiadomość: '||coalesce(new.message,'(brak)')],
    'Odpowiedz w Sunrise Market', 'https://sunrisemarket.pl/sprzedawca/zapytania');
  return new;
exception when others then
  raise warning 'notify_new_offer_lead failed: %', sqlerrm; return new;
end; $$;
drop trigger if exists trg_notify_new_offer_lead on market.offer_leads;
create trigger trg_notify_new_offer_lead after insert on market.offer_leads
for each row execute function market.notify_new_offer_lead();

-- 4. Zamówienie opłacone -> in-app (bez fałszywej informacji o cashbacku) + e-mail
create or replace function market.notify_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_buyer uuid; v_total numeric; v_cashback numeric; v_buyer_email text; r record; v_suser uuid; v_semail text;
begin
  select o.buyer_id, o.total_gross, coalesce(o.cashback_amount,0) into v_buyer, v_total, v_cashback from market.orders o where o.id = p_order;
  select u.email into v_buyer_email from auth.users u where u.id = v_buyer;
  if v_buyer is not null then
    begin
      perform market.notify_once(v_buyer, 'order_paid', 'Zamówienie opłacone',
        'Dziękujemy! Zapłacono '||coalesce(v_total,0)||' zł.'||case when v_cashback > 0 then ' Cashback '||round(v_cashback,2)||' pkt trafił na Twoje konto Sunrise.' else '' end,
        'order_paid:'||p_order::text);
      perform market.enqueue_mail(v_buyer_email, 'buyer', 'order_paid:'||p_order::text,
        'Zamówienie opłacone — Sunrise Market', 'Dziękujemy za zakupy!',
        array['Twoje zamówienie zostało opłacone: '||coalesce(v_total,0)||' zł.', case when v_cashback > 0 then 'Cashback '||round(v_cashback,2)||' pkt został naliczony na Twoje konto Sunrise.' else 'Status realizacji sprawdzisz w zakładce Zamówienia.' end],
        'Moje zamówienia', 'https://sunrisemarket.pl/zamowienia');
    exception when others then raise warning 'buyer notification failed for order %: %', p_order, sqlerrm; end;
  end if;
  for r in select oi.seller_id, sum(oi.seller_payout) net from market.order_items oi where oi.order_id = p_order group by oi.seller_id loop
    v_suser := null; v_semail := null;
    select s.email into v_semail from market.sellers s where s.id = r.seller_id;
    select u.id into v_suser from auth.users u where lower(u.email) = lower(v_semail) limit 1;
    if v_suser is not null then
      begin
        perform market.notify_once(v_suser, 'new_sale', 'Nowa sprzedaż!',
          'Sprzedano Twoją ofertę. Do rozliczenia przypisano '||round(coalesce(r.net,0),2)||' zł po prowizji platformy. Zrealizuj zamówienie w centrum sprzedawcy.',
          'new_sale:'||p_order::text||':'||r.seller_id::text);
      exception when others then raise warning 'seller notification failed for order %, seller %: %', p_order, r.seller_id, sqlerrm; end;
    end if;
    perform market.enqueue_mail(v_semail, 'seller', 'new_sale:'||p_order::text||':'||r.seller_id::text,
      'Nowa sprzedaż w Sunrise Market', 'Masz nową sprzedaż!',
      array['Klient opłacił zamówienie z Twoją ofertą.', 'Do rozliczenia: '||round(coalesce(r.net,0),2)||' zł po prowizji platformy.', 'Zrealizuj wysyłkę lub umów termin w centrum sprzedawcy.'],
      'Otwórz zamówienia', 'https://sunrisemarket.pl/sprzedawca/zamowienia');
  end loop;
exception when others then
  raise warning 'notify_order failed for order %: %', p_order, sqlerrm;
end; $$;

-- 5. Wysyłka -> kupujący
create or replace function market.notify_order_shipped() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if new.status = 'shipped' and coalesce(old.status,'') <> 'shipped' then
    select u.email into v_email from auth.users u where u.id = new.buyer_id;
    if new.buyer_id is not null then
      perform market.notify_once(new.buyer_id, 'order_shipped', 'Zamówienie wysłane',
        'Twoje zamówienie jest w drodze.'||case when coalesce(new.tracking_no,'') <> '' then ' Nr przesyłki: '||new.tracking_no else '' end,
        'order_shipped:'||new.id::text);
    end if;
    perform market.enqueue_mail(v_email, 'buyer', 'order_shipped:'||new.id::text,
      'Zamówienie wysłane — Sunrise Market', 'Twoje zamówienie jest w drodze',
      array[case when coalesce(new.tracking_no,'') <> '' then 'Numer przesyłki: '||new.tracking_no else 'Sprzedawca nadał przesyłkę.' end, 'Po odbiorze potwierdź dostawę w zakładce Zamówienia — wtedy rozliczamy sprzedawcę.'],
      'Moje zamówienia', 'https://sunrisemarket.pl/zamowienia');
  end if;
  return new;
exception when others then
  raise warning 'notify_order_shipped failed: %', sqlerrm; return new;
end; $$;
drop trigger if exists trg_notify_order_shipped on market.orders;
create trigger trg_notify_order_shipped after update of status on market.orders
for each row execute function market.notify_order_shipped();
