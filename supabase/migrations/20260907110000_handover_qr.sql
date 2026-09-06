-- 2026-09-07: odbiór/zwrot najmu przez QR (decyzja właściciela 2026-09-06). Sprzedawca pokazuje kod QR z rezerwacji,
-- klient skanuje telefonem → /odbior/<token> → tożsamość potwierdzona (jak kod SMS) i od razu protokół: zdjęcia, potwierdzenie.
-- Token: 32 znaki base64url w booking_handover_codes.link_token (ważny 15 min, jednorazowy).
alter table market.booking_handover_codes add column if not exists link_token text unique;

create or replace function market.issue_handover_link(p_booking uuid, p_phase text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_token text; v_seller uuid;
begin
  if p_phase not in ('handover','return') then raise exception 'Nieprawidłowy etap'; end if;
  select s.auth_user_id into v_seller from market.bookings b join market.sellers s on s.id = b.seller_id where b.id = p_booking;
  if v_seller is null or v_seller <> auth.uid() then raise exception 'Brak dostępu'; end if;
  v_token := replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
  v_token := replace(v_token, '=', '');
  update market.booking_handover_codes set expires_at = now() where booking_id = p_booking and phase = p_phase and verified_at is null and link_token is not null;
  insert into market.booking_handover_codes(booking_id, phase, code, link_token) values (p_booking, p_phase, 'qr', v_token);
  return v_token;
end $$;
revoke all on function market.issue_handover_link(uuid,text) from public, anon;
grant execute on function market.issue_handover_link(uuid,text) to authenticated, service_role;

-- Klient skanuje: sprawdzamy token, że to jego rezerwacja i że nie wygasł; oznaczamy potwierdzenie tożsamości
create or replace function market.verify_handover_link(p_token text)
returns table(booking_id uuid, phase text, status text) language plpgsql security definer set search_path to '' as $$
declare c market.booking_handover_codes%rowtype; b market.bookings%rowtype;
begin
  select * into c from market.booking_handover_codes where link_token = p_token;
  if c.id is null then return query select null::uuid, null::text, 'not_found'; return; end if;
  select * into b from market.bookings where id = c.booking_id;
  if b.buyer_id is distinct from auth.uid() then return query select c.booking_id, c.phase, 'not_yours'; return; end if;
  if c.verified_at is not null then return query select c.booking_id, c.phase, 'ok'; return; end if;
  if c.expires_at < now() then return query select c.booking_id, c.phase, 'expired'; return; end if;
  update market.booking_handover_codes set verified_at = now() where id = c.id;
  insert into market.booking_handover_protocols(booking_id, seller_id, buyer_id, resource_id, created_by, updated_by)
    values (b.id, b.seller_id, b.buyer_id, b.resource_id, auth.uid(), auth.uid()) on conflict (booking_id) do nothing;
  if c.phase = 'handover' then
    update market.booking_handover_protocols set handover_code_verified_at = now(), updated_at = now() where booking_handover_protocols.booking_id = b.id;
  else
    update market.booking_handover_protocols set return_code_verified_at = now(), updated_at = now() where booking_handover_protocols.booking_id = b.id;
  end if;
  return query select c.booking_id, c.phase, 'ok';
end $$;
revoke all on function market.verify_handover_link(text) from public, anon;
grant execute on function market.verify_handover_link(text) to authenticated, service_role;
