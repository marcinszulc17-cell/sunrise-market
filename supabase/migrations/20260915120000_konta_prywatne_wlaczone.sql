-- Konta prywatne (decyzja wlasciciela 2026-09-15).
--
-- Stan przed zmiana: caly kod - 13 funkcji bazy, edge functions i frontend -
-- rozpoznaje sprzedawce prywatnego po seller_type='private_partner', ale CHECK
-- na market.sellers dopuszczal wylacznie 'business','individual','sunrise'.
-- market.activate_trade_partner probuje zapisac 'private_partner', wiec
-- aktywacja konta prywatnego konczyla sie bledem naruszenia ograniczenia -
-- zanim jeszcze doszlo do bramki allow_individual_sellers w verify_kyc.
--
-- Rozszerzamy ograniczenie zamiast przepisywac 13 funkcji na 'individual':
-- wartosc uzywana przez kod staje sie wartoscia dozwolona w bazie.

alter table market.sellers drop constraint if exists sellers_seller_type_check;

alter table market.sellers add constraint sellers_seller_type_check
  check (seller_type = any (array['business'::text,'individual'::text,
                                 'private_partner'::text,'sunrise'::text]));

-- Bramka KYC musi objac obie nazwy konta prywatnego: 'individual' (nazwa
-- historyczna, zapisana w ograniczeniu) i 'private_partner' (nazwa, ktorej
-- faktycznie uzywa kod). Firma nadal musi podac poprawny NIP.
create or replace function market.verify_kyc(p_seller_id uuid, p_decision text, p_by text)
returns text
language plpgsql
set search_path to 'market','public','extensions'
as $function$
declare v_type text; v_nip text; v_allow boolean;
begin
  select s.seller_type, k.nip into v_type, v_nip
    from sellers s left join kyc_submissions k on k.seller_id=s.id and k.status='submitted'
    where s.id=p_seller_id;
  select value::boolean into v_allow from platform_config where key='allow_individual_sellers';
  if p_decision='verified' then
    if v_type in ('individual','private_partner') and not coalesce(v_allow,false) then
      raise exception 'Sprzedaz tylko dla firm. Konta prywatne nieaktywne na tym etapie.';
    end if;
    if v_type='business' and (v_nip is null or length(trim(v_nip))<10) then
      raise exception 'Firma musi podac poprawny NIP do weryfikacji (KYC).';
    end if;
  end if;
  update kyc_submissions set status=p_decision, reviewed_by=p_by, reviewed_at=now()
    where seller_id=p_seller_id and status='submitted';
  update sellers set kyc_status=p_decision,
    status = case when p_decision='verified' then 'active' else status end
    where id=p_seller_id;
  return p_decision;
end;$function$;

update market.platform_config set value='true' where key='allow_individual_sellers';
