-- 2026-09-07: „Puls” sprzedawcy (decyzja właściciela 2026-09-06): dzienne statystyki per ogłoszenie (wyświetlenia, ulubione,
-- zapytania, wiadomości), wykres 14 dni, podpowiedź ceny liczona z danych (mediana kategorii), przycisk Promuj.
create table if not exists market.offer_daily_stats (
  offer_id uuid not null references market.offers(id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Warsaw')::date,
  views integer not null default 0,
  favorites integer not null default 0,
  leads integer not null default 0,
  messages integer not null default 0,
  primary key (offer_id, day)
);
alter table market.offer_daily_stats enable row level security;
revoke all on table market.offer_daily_stats from anon, authenticated;
grant all on table market.offer_daily_stats to service_role;

create or replace function market.bump_offer_stat(p_offer uuid, p_col text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_col not in ('views','favorites','leads','messages') then return; end if;
  execute format('insert into market.offer_daily_stats(offer_id, day, %I) values ($1, (now() at time zone ''Europe/Warsaw'')::date, 1)
                  on conflict (offer_id, day) do update set %I = market.offer_daily_stats.%I + 1', p_col, p_col, p_col) using p_offer;
end $$;
revoke all on function market.bump_offer_stat(uuid,text) from public, anon, authenticated;

-- wyświetlenia: count_offer_view liczy też dzienny wpis
create or replace function market.count_offer_view(p_offer uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update market.offers set view_count = view_count + 1 where id = p_offer and status = 'active';
  if found then perform market.bump_offer_stat(p_offer, 'views'); end if;
end $$;

create or replace function market.trg_stat_watchlist() returns trigger language plpgsql security definer set search_path to '' as $$
begin perform market.bump_offer_stat(new.offer_id, 'favorites'); return new; end $$;
drop trigger if exists trg_stat_watchlist on market.watchlist;
create trigger trg_stat_watchlist after insert on market.watchlist for each row execute function market.trg_stat_watchlist();

create or replace function market.trg_stat_lead() returns trigger language plpgsql security definer set search_path to '' as $$
begin perform market.bump_offer_stat(new.offer_id, 'leads'); return new; end $$;
drop trigger if exists trg_stat_lead on market.offer_leads;
create trigger trg_stat_lead after insert on market.offer_leads for each row execute function market.trg_stat_lead();

create or replace function market.trg_stat_conversation() returns trigger language plpgsql security definer set search_path to '' as $$
begin perform market.bump_offer_stat(new.offer_id, 'messages'); return new; end $$;
drop trigger if exists trg_stat_conversation on market.conversations;
create trigger trg_stat_conversation after insert on market.conversations for each row execute function market.trg_stat_conversation();

-- Puls sprzedawcy: sumy, seria dzienna, ogłoszenia z trendem i podpowiedzią liczoną z danych
create or replace function market.seller_pulse(p_days integer default 14)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_seller uuid := market.current_seller_id(); v_from date; v_prev_from date; v_today date := (now() at time zone 'Europe/Warsaw')::date; out jsonb;
begin
  if v_seller is null then return null; end if;
  p_days := greatest(7, least(90, coalesce(p_days, 14)));
  v_from := v_today - (p_days - 1); v_prev_from := v_from - p_days;
  select jsonb_build_object(
    'days', p_days,
    'totals', (select jsonb_build_object(
        'views', coalesce(sum(s.views),0), 'favorites', coalesce(sum(s.favorites),0), 'leads', coalesce(sum(s.leads),0), 'messages', coalesce(sum(s.messages),0))
      from market.offer_daily_stats s join market.offers o on o.id = s.offer_id where o.seller_id = v_seller and s.day >= v_from),
    'prev_totals', (select jsonb_build_object('views', coalesce(sum(s.views),0), 'favorites', coalesce(sum(s.favorites),0), 'leads', coalesce(sum(s.leads),0), 'messages', coalesce(sum(s.messages),0))
      from market.offer_daily_stats s join market.offers o on o.id = s.offer_id where o.seller_id = v_seller and s.day >= v_prev_from and s.day < v_from),
    'sales', (select jsonb_build_object('count', count(distinct oi.order_id), 'gross', coalesce(sum(oi.line_gross),0))
      from market.order_items oi join market.orders ord on ord.id = oi.order_id
      where oi.seller_id = v_seller and ord.status in ('paid','shipped','delivered','completed') and ord.created_at >= v_from),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'views', coalesce(t.views,0), 'favorites', coalesce(t.favorites,0), 'leads', coalesce(t.leads,0), 'messages', coalesce(t.messages,0)) order by d.day), '[]'::jsonb)
      from generate_series(v_from, v_today, interval '1 day') as d(day)
      left join (select s.day, sum(s.views) views, sum(s.favorites) favorites, sum(s.leads) leads, sum(s.messages) messages
                 from market.offer_daily_stats s join market.offers o on o.id = s.offer_id where o.seller_id = v_seller and s.day >= v_from group by s.day) t on t.day = d.day::date),
    'offers', (select coalesce(jsonb_agg(x order by (x->>'views7')::int desc, x->>'title'), '[]'::jsonb) from (
      select jsonb_build_object(
        'offer_id', o.id, 'title', o.title, 'image_url', o.image_url, 'price_gross', o.price_gross, 'status', o.status, 'category', c.name,
        'views7', coalesce((select sum(views) from market.offer_daily_stats s where s.offer_id = o.id and s.day >= v_today - 6), 0),
        'views_prev7', coalesce((select sum(views) from market.offer_daily_stats s where s.offer_id = o.id and s.day >= v_today - 13 and s.day < v_today - 6), 0),
        'favorites', (select count(*) from market.watchlist w where w.offer_id = o.id),
        'leads', coalesce((select sum(leads + messages) from market.offer_daily_stats s where s.offer_id = o.id and s.day >= v_from), 0),
        'promoted_until', (o.attributes->>'promoted_until'),
        'photos', (select count(*) from market.offer_images oi where oi.offer_id = o.id),
        'description_len', length(coalesce(o.description,'')),
        'category_median_price', (select percentile_cont(0.5) within group (order by o2.price_gross) from market.offers o2 where o2.category_id = o.category_id and o2.status = 'active' and o2.id <> o.id and o2.price_gross > 0),
        'category_median_views7', (select percentile_cont(0.5) within group (order by v.v) from (
            select coalesce(sum(s.views),0) v from market.offers o2 left join market.offer_daily_stats s on s.offer_id = o2.id and s.day >= v_today - 6
            where o2.category_id = o.category_id and o2.status = 'active' and o2.id <> o.id group by o2.id) v)
      ) as x
      from market.offers o join market.categories c on c.id = o.category_id
      where o.seller_id = v_seller and o.status in ('active','paused') ) q)
  ) into out;
  return out;
end $$;
revoke all on function market.seller_pulse(integer) from public, anon;
grant execute on function market.seller_pulse(integer) to authenticated, service_role;
