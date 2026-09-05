-- Opinie o sprzedawcy NA PORTALU (decyzja właściciela 2026-09-05): publiczna strona sprzedawcy
-- /sprzedawcy/:id z oceną, rozkładem gwiazdek i listą opinii zweryfikowanych kupujących
-- (market.reviews — dodać może tylko klient z opłaconym zamówieniem, add_review_simple).
-- Sprzedawca może odpowiedzieć publicznie na opinię (reply_review), a w centrum sprzedaży widzi
-- swoje opinie (my_seller_reviews). Żadnych wymyślonych opinii — tylko prawdziwe zakupy.

alter table market.reviews add column if not exists seller_reply text;
alter table market.reviews add column if not exists seller_replied_at timestamptz;
create index if not exists reviews_seller_created_idx on market.reviews(seller_id, created_at desc);

-- Publiczny profil sprzedawcy: dane podstawowe, reputacja, rozkład ocen, opinie, aktywne oferty.
create or replace function market.seller_public_profile(p_seller uuid)
returns jsonb language sql stable security definer set search_path to 'market','public' as $$
select jsonb_build_object(
  'seller_id', s.id,
  'name', coalesce(nullif(s.legal_name,''), 'Sprzedawca Sunrise Market'),
  'seller_type', s.seller_type,
  'since', s.created_at,
  'status', s.status,
  'rating', coalesce(r.srednia_ocen,0),
  'reviews_count', coalesce(r.liczba_opinii,0),
  'badge', r.badge,
  'distribution', (
    select jsonb_object_agg(g.star, coalesce(c.n,0))
    from generate_series(1,5) g(star)
    left join (select rating, count(*) n from market.reviews where seller_id = s.id group by rating) c on c.rating = g.star
  ),
  'sales_count', (select count(distinct oi.order_id) from market.order_items oi join market.orders o on o.id = oi.order_id
                  where oi.seller_id = s.id and o.status in ('paid','shipped','delivered','completed')),
  'reviews', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rv.id, 'rating', rv.rating, 'comment', rv.comment, 'created_at', rv.created_at,
      'author', coalesce(nullif(b.display_name,''), 'Kupujący'),
      'offer_id', rv.offer_id, 'offer_title', o.title,
      'seller_reply', rv.seller_reply, 'seller_replied_at', rv.seller_replied_at
    ) order by rv.created_at desc)
    from (select * from market.reviews where seller_id = s.id order by created_at desc limit 100) rv
    left join market.buyers b on b.id = rv.buyer_id
    left join market.offers o on o.id = rv.offer_id
  ), '[]'::jsonb),
  'offers', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'price_gross', o.price_gross, 'image_url', o.image_url,
                                        'category', c.name, 'subscription', (o.attributes ? 'subscription')) order by o.created_at desc)
    from (select * from market.offers where seller_id = s.id and status = 'active' and coalesce(is_test,false) = false order by created_at desc limit 24) o
    left join market.categories c on c.id = o.category_id
  ), '[]'::jsonb),
  'offers_count', (select count(*) from market.offers o where o.seller_id = s.id and o.status = 'active' and coalesce(o.is_test,false) = false)
)
from market.sellers s
left join market.seller_reputation r on r.seller_id = s.id
where s.id = p_seller and s.status = 'active';
$$;
grant execute on function market.seller_public_profile(uuid) to anon, authenticated;

-- Sprzedawca: moje opinie (centrum sprzedaży).
create or replace function market.my_seller_reviews()
returns jsonb language sql stable security definer set search_path to 'market','public' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id', rv.id, 'rating', rv.rating, 'comment', rv.comment, 'created_at', rv.created_at,
  'author', coalesce(nullif(b.display_name,''), 'Kupujący'),
  'offer_id', rv.offer_id, 'offer_title', o.title,
  'seller_reply', rv.seller_reply, 'seller_replied_at', rv.seller_replied_at
) order by rv.created_at desc), '[]'::jsonb)
from market.reviews rv
join market.sellers s on s.id = rv.seller_id and s.auth_user_id = auth.uid()
left join market.buyers b on b.id = rv.buyer_id
left join market.offers o on o.id = rv.offer_id;
$$;
grant execute on function market.my_seller_reviews() to authenticated;

-- Publiczna odpowiedź sprzedawcy na opinię (tylko właściciel konta sprzedawcy; pusta treść usuwa odpowiedź).
create or replace function market.reply_review(p_review uuid, p_text text)
returns void language plpgsql security definer set search_path to 'market','public' as $$
declare v_seller uuid;
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  select rv.seller_id into v_seller from market.reviews rv join market.sellers s on s.id = rv.seller_id
   where rv.id = p_review and s.auth_user_id = auth.uid();
  if v_seller is null then raise exception 'Brak uprawnień do tej opinii'; end if;
  if length(coalesce(p_text,'')) > 1000 then raise exception 'Odpowiedź może mieć maksymalnie 1000 znaków'; end if;
  update market.reviews set seller_reply = nullif(trim(p_text),''), seller_replied_at = case when nullif(trim(p_text),'') is null then null else now() end
   where id = p_review;
end; $$;
grant execute on function market.reply_review(uuid, text) to authenticated;

-- Powiadomienie sprzedawcy o nowej opinii (in-app), żeby mógł odpowiedzieć.
create or replace function market.notify_seller_new_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_title text;
begin
  select s.auth_user_id into v_user from market.sellers s where s.id = new.seller_id;
  select o.title into v_title from market.offers o where o.id = new.offer_id;
  if v_user is not null then
    perform market.notify_once(v_user, 'seller_review', 'Nowa opinia o Twojej sprzedaży',
      'Klient ocenił „'||coalesce(v_title,'')||'” na '||new.rating||'/5. Możesz odpowiedzieć publicznie w centrum sprzedaży.',
      'seller_review:'||new.id::text);
  end if;
  return new;
exception when others then
  raise warning 'notify_seller_new_review failed for %: %', new.id, sqlerrm; return new;
end; $$;
drop trigger if exists trg_notify_seller_new_review on market.reviews;
create trigger trg_notify_seller_new_review after insert on market.reviews
for each row execute function market.notify_seller_new_review();

-- Blok "Sprzedawca" na stronie produktu pokazuje też odpowiedź sprzedawcy.
create or replace function market.seller_public_reputation(p_seller uuid)
returns jsonb language sql stable security definer set search_path to 'market','public' as $$
select jsonb_build_object(
  'seller_id', s.id, 'name', s.legal_name, 'rating', coalesce(r.srednia_ocen,0), 'reviews_count', coalesce(r.liczba_opinii,0),
  'badge', r.badge, 'status', s.status,
  'reviews', coalesce((
    select jsonb_agg(jsonb_build_object('rating',rv.rating,'comment',rv.comment,'created_at',rv.created_at,'seller_reply',rv.seller_reply) order by rv.created_at desc)
    from (select rating,comment,created_at,seller_reply from market.reviews where seller_id=s.id order by created_at desc limit 5) rv
  ),'[]'::jsonb)
)
from market.sellers s left join market.seller_reputation r on r.seller_id=s.id
where s.id=p_seller and s.status='active';
$$;
