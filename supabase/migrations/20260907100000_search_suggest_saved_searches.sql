-- 2026-09-07: wyszukiwarka „jak Allegro” (decyzja właściciela 2026-09-06):
--  • market.search_suggest(q) — podpowiedzi na żywo: oferty (z miniaturą), kategorie, miasta (anon)
--  • market.saved_searches — zapisane wyszukiwania z alertem; cron market-saved-search-tick co 30 min → notify_once (in-app + push)

create or replace function market.search_suggest(p_q text, p_limit integer default 6)
returns jsonb language sql stable security definer set search_path to 'market','public','extensions' as $$
with q as (select nullif(btrim(p_q),'') as t),
offers as (
  select o.id, o.title, o.price_gross, o.image_url, coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase') as purchase_mode, c.name as category
  from market.offers o join market.categories c on c.id=o.category_id, q
  where o.status='active' and q.t is not null and (o.title ilike '%'||q.t||'%' or similarity(o.title,q.t)>0.3)
  order by coalesce(o.is_test,false) asc, (o.title ilike q.t||'%') desc, similarity(o.title,q.t) desc, o.view_count desc nulls last
  limit greatest(1, p_limit)
),
cats as (
  select c.name, c.slug from market.categories c, q
  where q.t is not null and c.name ilike '%'||q.t||'%' and exists (select 1 from market.offers o where o.category_id=c.id and o.status='active')
  order by (c.name ilike q.t||'%') desc, length(c.name) limit 4
),
cities as (
  select sc.name, sc.slug from market.service_cities sc, q
  where q.t is not null and (sc.name ilike q.t||'%' or sc.region ilike q.t||'%') order by sc.name limit 3
)
select jsonb_build_object(
  'offers', coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'price_gross',price_gross,'image_url',image_url,'purchase_mode',purchase_mode,'category',category)) from offers),'[]'::jsonb),
  'categories', coalesce((select jsonb_agg(jsonb_build_object('name',name,'slug',slug)) from cats),'[]'::jsonb),
  'cities', coalesce((select jsonb_agg(jsonb_build_object('name',name,'slug',slug)) from cities),'[]'::jsonb)
);
$$;
grant execute on function market.search_suggest(text,integer) to anon, authenticated, service_role;

create table if not exists market.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query text,
  category_slug text,
  price_min numeric,
  price_max numeric,
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  new_count integer not null default 0
);
create index if not exists saved_searches_user_idx on market.saved_searches(user_id, created_at desc);
alter table market.saved_searches enable row level security;
drop policy if exists saved_searches_own on market.saved_searches;
create policy saved_searches_own on market.saved_searches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on table market.saved_searches to authenticated;
grant all on table market.saved_searches to service_role;

create or replace function market.save_search(p_name text, p_query text, p_category_slug text, p_price_min numeric, p_price_max numeric, p_filters jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'Zaloguj się, aby zapisać wyszukiwanie'; end if;
  select count(*) into v_n from market.saved_searches where user_id = auth.uid() and active;
  if v_n >= 20 then raise exception 'Maksymalnie 20 zapisanych wyszukiwań'; end if;
  insert into market.saved_searches(user_id, name, query, category_slug, price_min, price_max, filters)
  values (auth.uid(), left(coalesce(nullif(btrim(p_name),''),'Wyszukiwanie'),80), nullif(btrim(p_query),''), nullif(btrim(p_category_slug),''), p_price_min, p_price_max, coalesce(p_filters,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function market.save_search(text,text,text,numeric,numeric,jsonb) from public, anon;
grant execute on function market.save_search(text,text,text,numeric,numeric,jsonb) to authenticated, service_role;

create or replace function market.my_saved_searches()
returns table(id uuid, name text, query text, category_slug text, price_min numeric, price_max numeric, filters jsonb, new_count integer, created_at timestamptz, last_checked_at timestamptz)
language sql security definer set search_path to '' stable as $$
  select s.id, s.name, s.query, s.category_slug, s.price_min, s.price_max, s.filters, s.new_count, s.created_at, s.last_checked_at
  from market.saved_searches s where s.user_id = auth.uid() and s.active order by s.created_at desc;
$$;
revoke all on function market.my_saved_searches() from public, anon;
grant execute on function market.my_saved_searches() to authenticated, service_role;

create or replace function market.delete_saved_search(p_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  delete from market.saved_searches where id = p_id and user_id = auth.uid();
  return found;
end $$;
revoke all on function market.delete_saved_search(uuid) from public, anon;
grant execute on function market.delete_saved_search(uuid) to authenticated, service_role;

-- Otworzenie zapisanego wyszukiwania zeruje licznik „nowe”
create or replace function market.touch_saved_search(p_id uuid)
returns void language sql security definer set search_path to '' as $$
  update market.saved_searches set last_seen_at = now(), new_count = 0 where id = p_id and user_id = auth.uid();
$$;
revoke all on function market.touch_saved_search(uuid) from public, anon;
grant execute on function market.touch_saved_search(uuid) to authenticated, service_role;

-- Zegarek: nowe oferty pasujące do zapisanych wyszukiwań → powiadomienie (in-app + push przez notifications)
create or replace function market.saved_search_tick()
returns integer language plpgsql security definer set search_path to '' as $$
declare s record; v_n int; v_total int := 0; v_now timestamptz := now(); v_first text; v_url text;
begin
  for s in select * from market.saved_searches where active and last_checked_at < v_now - interval '10 minutes' loop
    select count(*), max(r.title) into v_n, v_first
    from market.search_offers_v2(s.query, s.category_slug, s.price_min, s.price_max, 'najnowsze', 50, s.filters) r
    where r.created_at > s.last_checked_at;
    if v_n > 0 then
      v_url := '/szukaj?zapisane=' || s.id::text;
      perform market.notify_once(s.user_id, 'search',
        case when v_n = 1 then 'Nowe ogłoszenie: ' || s.name else v_n::text || ' nowe ogłoszenia: ' || s.name end,
        case when v_n = 1 then coalesce(v_first,'') else 'm.in. ' || coalesce(v_first,'') end || ' — otwórz zapisane wyszukiwanie.',
        'saved_search:' || s.id::text || ':' || to_char(v_now, 'YYYYMMDDHH24MI'));
      update market.saved_searches set new_count = new_count + v_n, last_checked_at = v_now where id = s.id;
      v_total := v_total + v_n;
    else
      update market.saved_searches set last_checked_at = v_now where id = s.id;
    end if;
  end loop;
  return v_total;
end $$;
revoke all on function market.saved_search_tick() from public, anon, authenticated;
select cron.unschedule('market-saved-search-tick') where exists (select 1 from cron.job where jobname = 'market-saved-search-tick');
select cron.schedule('market-saved-search-tick', '*/30 * * * *', 'select market.saved_search_tick();');
