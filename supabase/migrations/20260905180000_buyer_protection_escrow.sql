-- Ochrona Kupujących Sunrise (decyzja właściciela 2026-09-05).
-- Każda transakcja idzie przez Sunrise; sprzedawca dostaje wypłatę DOPIERO po odbiorze towaru
-- (potwierdzenie kupującego / doręczenie kuriera) albo po auto-zwolnieniu po `buyer_protection_hold_days`.
-- Mechanizm: seller_settlements.status='scheduled' + available_at=null (blokada) -> release ustawia
-- available_at=now() -> cron retry-seller-settlements wypłaca (pay-credit). Spór wstrzymuje wypłatę.

-- 1. Konfiguracja: długość okna ochrony (dni).
insert into market.platform_config(key, value)
values ('buyer_protection_hold_days', '14')
on conflict (key) do nothing;

-- 1a. Status 'processing' używa cron retry-seller-settlements (claim) — dotąd brakowało go w CHECK.
alter table market.seller_settlements drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements add constraint seller_settlements_status_check
  check (status = any (array['scheduled','pending','processing','settled','failed','cancelled']));

-- 2. Znacznik ostatniej zmiany statusu zamówienia (orders nie ma delivered_at/updated_at).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='market' and table_name='orders' and column_name='status_changed_at') then
    alter table market.orders add column status_changed_at timestamptz not null default now();
    -- Backfill: istniejące zamówienia dostają datę rozliczenia karty lub utworzenia.
    update market.orders set status_changed_at = coalesce(card_settled_at, created_at, now());
  end if;
end $$;

create or replace function market.trg_orders_status_changed_at()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end; $$;
drop trigger if exists trg_orders_status_changed_at on market.orders;
create trigger trg_orders_status_changed_at before update of status on market.orders
  for each row execute function market.trg_orders_status_changed_at();

create index if not exists orders_status_changed_idx on market.orders(status, status_changed_at);

create or replace function market.buyer_protection_hold_days()
returns integer language sql stable set search_path to '' as $$
  select greatest(0, coalesce((select value::int from market.platform_config where key='buyer_protection_hold_days'), 14));
$$;

-- 3. Zwolnienie wypłaty: scheduled + available_at null -> available_at = now(). Spór = blokada.
create or replace function market.release_order_settlements(p_order uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_status text; v_n int;
begin
  select status into v_status from market.orders where id = p_order;
  if v_status is null or v_status = 'disputed' then return 0; end if;
  update market.seller_settlements
  set available_at = now(), updated_at = now()
  where order_id = p_order and status = 'scheduled' and available_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function market.release_order_settlements(uuid) from public, anon, authenticated;
grant execute on function market.release_order_settlements(uuid) to service_role;

create or replace function market.trg_release_settlements_on_delivery()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status in ('delivered','completed') and coalesce(old.status,'') not in ('delivered','completed') then
    perform market.release_order_settlements(new.id);
  end if;
  -- 'disputed': nic nie robimy — wypłata pozostaje wstrzymana.
  return new;
exception when others then
  raise warning 'release_settlements_on_delivery failed for %: %', new.id, sqlerrm; return new;
end; $$;
drop trigger if exists trg_release_settlements_on_delivery on market.orders;
create trigger trg_release_settlements_on_delivery after update of status on market.orders
  for each row execute function market.trg_release_settlements_on_delivery();

-- 4. Potwierdzenie odbioru całego zamówienia przez kupującego (per pozycja: buyer_confirm_item_delivery).
create or replace function market.buyer_confirm_delivery(p_order uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_buyer uuid; v_status text; r record;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  select buyer_id, status into v_buyer, v_status from market.orders where id = p_order for update;
  if v_buyer is null then return jsonb_build_object('ok',false,'error','not_found','message','Zamówienie nie istnieje.'); end if;
  if v_buyer <> auth.uid() then return jsonb_build_object('ok',false,'error','forbidden','message','To nie jest Twoje zamówienie.'); end if;
  if v_status in ('delivered','completed') then return jsonb_build_object('ok',true,'status',v_status,'already',true); end if;
  if v_status not in ('paid','shipped') then return jsonb_build_object('ok',false,'error','bad_status','message','Tego zamówienia nie można potwierdzić.'); end if;

  for r in select ft.id, ft.seller_id, ft.title from market.fulfillment_tasks ft
           where ft.order_id = p_order and coalesce(ft.status,'pending') not in ('delivered','cancelled') loop
    update market.fulfillment_tasks set status='delivered', updated_at=now() where id = r.id;
    insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
    values (r.id, p_order, r.seller_id, v_buyer, 'delivered', auth.uid(), jsonb_build_object('source','buyer','scope','order','title',r.title))
    on conflict do nothing;
  end loop;

  update market.orders set status='delivered' where id = p_order and status in ('paid','shipped');
  return jsonb_build_object('ok',true,'status','delivered');
end; $$;
revoke all on function market.buyer_confirm_delivery(uuid) from public, anon;
grant execute on function market.buyer_confirm_delivery(uuid) to authenticated, service_role;

-- 5. Spory.
create table if not exists market.order_disputes(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references market.orders(id) on delete cascade,
  buyer_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','refunded','released','rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create unique index if not exists order_disputes_one_open_idx on market.order_disputes(order_id) where status = 'open';
alter table market.order_disputes enable row level security;
-- Dostęp wyłącznie przez RPC (security definer).

-- Stara wersja (bez autoryzacji, tabela market.disputes) — zastąpiona.
drop function if exists market.open_dispute(uuid, text, text);

create or replace function market.open_dispute(p_order uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  o record; v_id uuid; v_reason text := nullif(btrim(p_reason),'');
  v_buyer_email text; r record; v_op record; v_op_uid uuid;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_reason is null then return jsonb_build_object('ok',false,'error','reason_required','message','Opisz problem z zamówieniem.'); end if;

  select id, buyer_id, status, total_gross, status_changed_at into o from market.orders where id = p_order for update;
  if o.id is null then return jsonb_build_object('ok',false,'error','not_found','message','Zamówienie nie istnieje.'); end if;
  if o.buyer_id <> auth.uid() then return jsonb_build_object('ok',false,'error','forbidden','message','To nie jest Twoje zamówienie.'); end if;
  if o.status = 'disputed' then
    select id into v_id from market.order_disputes where order_id = p_order and status = 'open';
    return jsonb_build_object('ok',true,'already',true,'dispute_id',v_id);
  end if;
  if o.status not in ('paid','shipped','delivered') then
    return jsonb_build_object('ok',false,'error','bad_status','message','Spór można otworzyć tylko dla opłaconego zamówienia w trakcie realizacji.');
  end if;
  -- Okno ochrony: wypłata jeszcze nie zwolniona / nie wypłacona.
  if exists (select 1 from market.seller_settlements s where s.order_id = p_order
             and (s.status in ('settled','processing') or (s.available_at is not null and s.available_at <= now()))) then
    return jsonb_build_object('ok',false,'error','hold_expired','message','Okres Ochrony Kupujących dla tego zamówienia minął — skontaktuj się ze sprzedawcą lub złóż zwrot.');
  end if;
  if o.status = 'delivered' and o.status_changed_at < now() - make_interval(days => market.buyer_protection_hold_days()) then
    return jsonb_build_object('ok',false,'error','hold_expired','message','Okres Ochrony Kupujących dla tego zamówienia minął.');
  end if;

  insert into market.order_disputes(order_id, buyer_id, reason) values (p_order, auth.uid(), v_reason) returning id into v_id;
  update market.orders set status = 'disputed' where id = p_order;

  select u.email into v_buyer_email from auth.users u where u.id = o.buyer_id;
  -- Sprzedawcy z tego zamówienia.
  for r in select distinct s.id, s.email, s.auth_user_id from market.order_items oi join market.sellers s on s.id = oi.seller_id where oi.order_id = p_order loop
    begin
      if r.auth_user_id is not null then
        perform market.notify_once(r.auth_user_id, 'order_dispute', 'Kupujący zgłosił spór',
          'Zamówienie '||left(p_order::text,8)||' — wypłata wstrzymana do wyjaśnienia. Powód: '||left(v_reason,200),
          'order_dispute:'||v_id::text);
      end if;
      perform market.enqueue_mail(r.email, 'seller', 'order_dispute_seller:'||v_id::text,
        'Spór do zamówienia — Ochrona Kupujących Sunrise', 'Kupujący zgłosił problem z zamówieniem',
        array['Zamówienie: '||p_order::text, 'Powód: '||v_reason, 'Wypłata za to zamówienie jest wstrzymana do rozstrzygnięcia sporu przez operatora Sunrise.'],
        'Otwórz zamówienia', 'https://sunrisemarket.pl/sprzedawca/zamowienia');
    exception when others then raise warning 'open_dispute seller notify failed: %', sqlerrm; end;
  end loop;
  -- Operatorzy.
  for v_op in select email from market.operators loop
    begin
      select id into v_op_uid from auth.users where lower(email) = lower(v_op.email) limit 1;
      if v_op_uid is not null then
        perform market.notify_once(v_op_uid, 'order_dispute', 'Nowy spór do rozstrzygnięcia',
          'Zamówienie '||left(p_order::text,8)||' ('||coalesce(v_buyer_email,'?')||'): '||left(v_reason,200), 'order_dispute_op:'||v_id::text);
      end if;
      perform market.enqueue_mail(v_op.email, 'operator', 'order_dispute_op:'||v_id::text,
        'Nowy spór — Ochrona Kupujących', 'Kupujący otworzył spór',
        array['Zamówienie: '||p_order::text, 'Kupujący: '||coalesce(v_buyer_email,'?'), 'Kwota: '||coalesce(o.total_gross,0)||' zł', 'Powód: '||v_reason],
        'Panel operatora', 'https://sunrisemarket.pl/operator');
    exception when others then raise warning 'open_dispute operator notify failed: %', sqlerrm; end;
  end loop;
  begin
    perform market.notify_once(o.buyer_id, 'order_dispute', 'Spór został otwarty',
      'Wstrzymaliśmy wypłatę dla sprzedawcy. Operator Sunrise rozpatrzy zgłoszenie.', 'order_dispute_buyer:'||v_id::text);
  exception when others then null; end;

  return jsonb_build_object('ok',true,'dispute_id',v_id);
end; $$;
revoke all on function market.open_dispute(uuid, text) from public, anon;
grant execute on function market.open_dispute(uuid, text) to authenticated;

-- Rozstrzygnięcie: operator (JWT) lub service_role (edge fn order-refund po wykonaniu zwrotu).
create or replace function market.resolve_dispute(p_dispute uuid, p_outcome text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare d record; v_new_dispute text; v_new_order text; v_actor uuid := auth.uid();
begin
  if coalesce(auth.role(),'') <> 'service_role' and not market.is_operator() then raise exception 'Tylko operator'; end if;
  if p_outcome not in ('release','refund','rejected') then raise exception 'Nieznany wynik sporu: %', p_outcome; end if;

  select od.*, o.status as order_status into d from market.order_disputes od join market.orders o on o.id = od.order_id where od.id = p_dispute for update of od;
  if d.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if d.status <> 'open' then return jsonb_build_object('ok',true,'already',true,'status',d.status); end if;

  if p_outcome = 'refund' then
    v_new_dispute := 'refunded'; v_new_order := 'cancelled';
    update market.seller_settlements set status='cancelled', updated_at=now()
    where order_id = d.order_id and status in ('scheduled','pending','failed');
  elsif p_outcome = 'release' then
    v_new_dispute := 'released'; v_new_order := 'completed';
  else
    v_new_dispute := 'rejected'; v_new_order := 'delivered';
  end if;

  update market.order_disputes set status=v_new_dispute, resolution=p_note, resolved_at=now(), resolved_by=v_actor where id = p_dispute;
  -- Zmiana statusu zamówienia uruchamia trigger zwalniający wypłatę (delivered/completed).
  update market.orders set status=v_new_order where id = d.order_id and status = 'disputed';

  begin
    perform market.notify_once(d.buyer_id, 'order_dispute', 'Spór rozstrzygnięty',
      case p_outcome when 'refund' then 'Otrzymasz zwrot pieniędzy za zamówienie.' when 'release' then 'Spór zamknięty — zamówienie uznane za zrealizowane.' else 'Spór odrzucony — zamówienie uznane za dostarczone.' end
      ||coalesce(' '||p_note,''), 'order_dispute_resolved:'||p_dispute::text);
  exception when others then null; end;

  return jsonb_build_object('ok',true,'status',v_new_dispute,'order_status',v_new_order);
end; $$;
revoke all on function market.resolve_dispute(uuid, text, text) from public, anon;
grant execute on function market.resolve_dispute(uuid, text, text) to authenticated, service_role;

-- 6. Auto-zwolnienie po oknie ochrony + przypomnienie o niewysłanych zamówieniach (bez auto-anulowania).
create or replace function market.auto_release_settlements()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_days int := market.buyer_protection_hold_days(); v_completed int := 0; v_notified int := 0; r record;
begin
  with c as (
    update market.orders set status = 'completed'
    where status in ('shipped','delivered') and status_changed_at < now() - make_interval(days => v_days)
    returning id)
  select count(*) into v_completed from c;

  for r in select o.id, o.buyer_id, u.email from market.orders o join auth.users u on u.id = o.buyer_id
           where o.status = 'paid' and o.status_changed_at < now() - interval '30 days'
             and not exists (select 1 from market.bookings b where b.order_id = o.id)
             and not exists (select 1 from market.notifications n where n.user_id = o.buyer_id and n.dedupe_key = 'order_stale_paid:'||o.id::text) loop
    begin
      perform market.notify_once(r.buyer_id, 'order_stale', 'Zamówienie wciąż niewysłane',
        'Sprzedawca nie wysłał zamówienia '||left(r.id::text,8)||' od 30 dni. Możesz je anulować i odzyskać pieniądze (Ochrona Kupujących).', 'order_stale_paid:'||r.id::text);
      perform market.enqueue_mail(r.email, 'buyer', 'order_stale_paid:'||r.id::text,
        'Twoje zamówienie nie zostało wysłane — Sunrise Market', 'Zamówienie czeka na wysyłkę ponad 30 dni',
        array['Sprzedawca nie nadał jeszcze przesyłki.', 'Pieniądze są bezpieczne w Ochronie Kupujących Sunrise — możesz anulować zamówienie i otrzymać zwrot lub zgłosić spór w zakładce Zamówienia.'],
        'Moje zamówienia', 'https://sunrisemarket.pl/zamowienia');
      v_notified := v_notified + 1;
    exception when others then raise warning 'stale paid notify failed %: %', r.id, sqlerrm; end;
  end loop;
  return jsonb_build_object('completed', v_completed, 'notified', v_notified);
end; $$;
revoke all on function market.auto_release_settlements() from public, anon, authenticated;
grant execute on function market.auto_release_settlements() to service_role;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'market-buyer-protection-release') then
    perform cron.unschedule('market-buyer-protection-release');
  end if;
  perform cron.schedule('market-buyer-protection-release', '41 * * * *', 'select market.auto_release_settlements();');
end $$;

-- 7. Listy sporów.
create or replace function market.my_order_disputes()
returns table(id uuid, order_id uuid, reason text, status text, resolution text, created_at timestamptz, resolved_at timestamptz, amount numeric)
language sql security definer stable set search_path to '' as $$
  select d.id, d.order_id, d.reason, d.status, d.resolution, d.created_at, d.resolved_at, o.total_gross
  from market.order_disputes d join market.orders o on o.id = d.order_id
  where d.buyer_id = auth.uid() order by d.created_at desc;
$$;
revoke all on function market.my_order_disputes() from public, anon;
grant execute on function market.my_order_disputes() to authenticated;

create or replace function market.operator_disputes()
returns table(id uuid, order_id uuid, order_status text, buyer_email text, sellers text, amount numeric, payment_provider text, reason text, status text, resolution text, created_at timestamptz, resolved_at timestamptz)
language plpgsql security definer stable set search_path to '' as $$
begin
  if not market.is_operator() then raise exception 'Tylko operator'; end if;
  return query
  select d.id, d.order_id, o.status, u.email::text,
    (select string_agg(distinct coalesce(s.legal_name, s.email), ', ') from market.order_items oi join market.sellers s on s.id = oi.seller_id where oi.order_id = d.order_id),
    o.total_gross, o.payment_provider, d.reason, d.status, d.resolution, d.created_at, d.resolved_at
  from market.order_disputes d
  join market.orders o on o.id = d.order_id
  left join auth.users u on u.id = d.buyer_id
  order by (d.status = 'open') desc, d.created_at desc;
end; $$;
revoke all on function market.operator_disputes() from public, anon;
grant execute on function market.operator_disputes() to authenticated;
