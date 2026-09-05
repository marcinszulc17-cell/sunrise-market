-- 2026-09-06: Wiadomości kupujący ↔ sprzedawca (decyzja właściciela; wzór „Napisz do sprzedawcy” / zakładka Wiadomości).
-- Wątek = (oferta, kupujący). Sprzedawca odpowiada z Panelu. Powiadomienie in-app/push przez market.notify_once.
-- Bez e-maili. RLS: kupujący widzi swoje wątki, sprzedawca — wątki swoich ofert (current_seller_id()).

create table if not exists market.conversations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references market.offers(id) on delete cascade,
  buyer_id uuid not null,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_preview text,
  buyer_unread integer not null default 0,
  seller_unread integer not null default 0,
  unique (offer_id, buyer_id)
);
create index if not exists conversations_buyer_idx on market.conversations(buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx on market.conversations(seller_id, last_message_at desc);

create table if not exists market.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references market.conversations(id) on delete cascade,
  sender_role text not null check (sender_role in ('buyer','seller')),
  sender_user uuid not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on market.messages(conversation_id, created_at);

alter table market.conversations enable row level security;
alter table market.messages enable row level security;
drop policy if exists conversations_participants on market.conversations;
create policy conversations_participants on market.conversations for select to authenticated
  using (buyer_id = auth.uid() or seller_id = market.current_seller_id());
drop policy if exists messages_participants on market.messages;
create policy messages_participants on market.messages for select to authenticated
  using (exists (select 1 from market.conversations c where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = market.current_seller_id())));
grant select on market.conversations, market.messages to authenticated;

-- Rola bieżącego użytkownika w wątku
create or replace function market.conversation_role(p_conv uuid)
returns text language sql stable security definer set search_path to '' as $$
  select case when c.buyer_id = auth.uid() then 'buyer' when c.seller_id = market.current_seller_id() then 'seller' end
  from market.conversations c where c.id = p_conv;
$$;

-- Kupujący pisze do sprzedawcy z karty oferty (tworzy wątek albo dopisuje do istniejącego)
create or replace function market.start_conversation(p_offer uuid, p_body text)
returns uuid language plpgsql security definer set search_path to 'market','public' as $$
declare v_uid uuid := auth.uid(); v_seller uuid; v_conv uuid; v_title text; v_seller_user uuid;
begin
  if v_uid is null then raise exception 'Zaloguj się, aby napisać do sprzedawcy'; end if;
  if length(trim(coalesce(p_body,''))) < 2 then raise exception 'Wpisz treść wiadomości'; end if;
  select o.seller_id, o.title into v_seller, v_title from market.offers o where o.id = p_offer and o.status = 'active';
  if v_seller is null then raise exception 'Oferta nie jest dostępna'; end if;
  if v_seller = market.current_seller_id() then raise exception 'To Twoja własna oferta'; end if;
  insert into market.conversations(offer_id, buyer_id, seller_id) values (p_offer, v_uid, v_seller)
    on conflict (offer_id, buyer_id) do update set last_message_at = now() returning id into v_conv;
  insert into market.messages(conversation_id, sender_role, sender_user, body) values (v_conv, 'buyer', v_uid, trim(p_body));
  update market.conversations set last_message_at = now(), last_preview = left(trim(p_body), 120), seller_unread = seller_unread + 1 where id = v_conv;
  select s.auth_user_id into v_seller_user from market.sellers s where s.id = v_seller;
  if v_seller_user is not null then
    perform market.notify_once(v_seller_user, 'message', 'Nowa wiadomość od kupującego',
      'Pytanie o „'||coalesce(v_title,'')||'”: '||left(trim(p_body), 100), 'message:'||v_conv::text||':'||extract(epoch from now())::bigint::text);
  end if;
  return v_conv;
end $$;

-- Odpowiedź w istniejącym wątku (kupujący lub sprzedawca)
create or replace function market.send_message(p_conv uuid, p_body text)
returns uuid language plpgsql security definer set search_path to 'market','public' as $$
declare v_uid uuid := auth.uid(); v_role text; v_msg uuid; v_c market.conversations%rowtype; v_title text; v_target uuid;
begin
  if v_uid is null then raise exception 'Zaloguj się'; end if;
  if length(trim(coalesce(p_body,''))) < 1 then raise exception 'Wpisz treść wiadomości'; end if;
  v_role := market.conversation_role(p_conv);
  if v_role is null then raise exception 'Brak dostępu do tej rozmowy'; end if;
  select * into v_c from market.conversations where id = p_conv;
  insert into market.messages(conversation_id, sender_role, sender_user, body) values (p_conv, v_role, v_uid, trim(p_body)) returning id into v_msg;
  if v_role = 'buyer' then
    update market.conversations set last_message_at = now(), last_preview = left(trim(p_body),120), seller_unread = seller_unread + 1 where id = p_conv;
    select s.auth_user_id into v_target from market.sellers s where s.id = v_c.seller_id;
  else
    update market.conversations set last_message_at = now(), last_preview = left(trim(p_body),120), buyer_unread = buyer_unread + 1 where id = p_conv;
    v_target := v_c.buyer_id;
  end if;
  select o.title into v_title from market.offers o where o.id = v_c.offer_id;
  if v_target is not null then
    perform market.notify_once(v_target, 'message', case when v_role = 'buyer' then 'Nowa wiadomość od kupującego' else 'Sprzedawca odpowiedział' end,
      '„'||coalesce(v_title,'')||'”: '||left(trim(p_body), 100), 'message:'||v_msg::text);
  end if;
  return v_msg;
end $$;

-- Lista moich wątków (jako kupujący i jako sprzedawca)
create or replace function market.my_conversations()
returns table(conversation_id uuid, role text, offer_id uuid, offer_title text, offer_image text, offer_price numeric, counterpart text, last_preview text, last_message_at timestamptz, unread integer)
language sql stable security definer set search_path to 'market','public' as $$
  select c.id, case when c.buyer_id = auth.uid() then 'buyer' else 'seller' end,
         o.id, o.title, o.image_url, o.price_gross,
         case when c.buyer_id = auth.uid() then s.legal_name else coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1), 'Kupujący') end,
         c.last_preview, c.last_message_at,
         case when c.buyer_id = auth.uid() then c.buyer_unread else c.seller_unread end
  from market.conversations c
  join market.offers o on o.id = c.offer_id
  join market.sellers s on s.id = c.seller_id
  left join auth.users u on u.id = c.buyer_id
  where auth.uid() is not null and (c.buyer_id = auth.uid() or c.seller_id = market.current_seller_id())
  order by c.last_message_at desc;
$$;

-- Wiadomości w wątku + oznaczenie jako przeczytane
create or replace function market.conversation_messages(p_conv uuid)
returns table(id uuid, sender_role text, mine boolean, body text, created_at timestamptz)
language plpgsql security definer set search_path to 'market','public' as $$
declare v_role text := market.conversation_role(p_conv);
begin
  if v_role is null then raise exception 'Brak dostępu do tej rozmowy'; end if;
  if v_role = 'buyer' then update market.conversations set buyer_unread = 0 where market.conversations.id = p_conv;
  else update market.conversations set seller_unread = 0 where market.conversations.id = p_conv; end if;
  return query select m.id, m.sender_role, (m.sender_role = v_role), m.body, m.created_at
    from market.messages m where m.conversation_id = p_conv order by m.created_at;
end $$;

create or replace function market.unread_messages_count()
returns integer language sql stable security definer set search_path to 'market','public' as $$
  select coalesce(sum(case when c.buyer_id = auth.uid() then c.buyer_unread else c.seller_unread end),0)::int
  from market.conversations c where auth.uid() is not null and (c.buyer_id = auth.uid() or c.seller_id = market.current_seller_id());
$$;

revoke all on function market.start_conversation(uuid,text), market.send_message(uuid,text), market.my_conversations(), market.conversation_messages(uuid), market.unread_messages_count(), market.conversation_role(uuid) from public;
grant execute on function market.start_conversation(uuid,text), market.send_message(uuid,text), market.my_conversations(), market.conversation_messages(uuid), market.unread_messages_count(), market.conversation_role(uuid) to authenticated, service_role;
