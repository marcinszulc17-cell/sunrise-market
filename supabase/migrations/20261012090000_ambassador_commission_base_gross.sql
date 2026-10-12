-- Decyzja wlasciciela 2026-10-12: prowizja ambasadora ZAWSZE od kwoty BRUTTO (brutto od brutto).
-- Kolejka ambassador_commission_outbox: amount_net (nazwa historyczna, czytana przez edge fn checkout/stripe-webhook
-- i przekazywana do MySunrise jako podstawa) = eligible_gross. Brak stawki VAT nie blokuje juz prowizji.
-- Zastosowana w bazie 2026-10-12 (apply_migration ambassador_commission_base_gross).
comment on column market.ambassador_commission_outbox.amount_net is 'PODSTAWA PROWIZJI = KWOTA BRUTTO (decyzja wlasciciela 2026-10-12). Nazwa kolumny historyczna.';

CREATE OR REPLACE FUNCTION market.enqueue_ambassador_commission(p_order uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_order market.orders%rowtype;
  v_email text;
  v_count integer:=0;
  v_all_gross numeric:=0;
  v_discount_ratio numeric:=0;
  v_gross numeric:=0;
  v_payload jsonb:='[]'::jsonb;
  v_status text;
  v_reason text;
begin
  select * into v_order from market.orders where id=p_order;
  if v_order.id is null or v_order.status<>'paid' then return; end if;
  select u.email::text into v_email from auth.users u where u.id=v_order.buyer_id;
  select coalesce(sum(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)),0) into v_all_gross from market.order_items oi where oi.order_id=p_order;
  v_discount_ratio:=case when v_all_gross>0 then least(1,greatest(0,coalesce(v_order.discount_amount,0)/v_all_gross)) else 0 end;
  select count(*)::integer,
         coalesce(sum(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio)),0),
         coalesce(jsonb_agg(jsonb_build_object(
           'order_item_id',oi.id,'offer_id',oi.offer_id,'gross_before_discount',coalesce(oi.line_gross,oi.qty*oi.unit_price_gross),
           'discount_ratio',v_discount_ratio,'eligible_gross',round(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio),2),
           'vat_treatment',oi.vat_treatment_snapshot,'vat_rate',oi.vat_rate,
           'commission_base','gross',
           'commission_model',oi.commission_model_snapshot
         ) order by oi.id),'[]'::jsonb)
    into v_count,v_gross,v_payload
  from market.order_items oi where oi.order_id=p_order and oi.ambassador_eligible=true;
  if v_count=0 then return; end if;
  if coalesce(v_email,'')='' then v_status:='pending_identity';v_reason:='Brak adresu e-mail kupującego';
  else v_status:='ready';v_reason:=null; end if;
  insert into market.ambassador_commission_outbox(order_id,buyer_id,buyer_email,eligible_gross,amount_net,status,reason,payload,updated_at)
  values(v_order.id,v_order.buyer_id,v_email,round(v_gross,2),round(v_gross,2),v_status,v_reason,
    jsonb_build_object('source','sunrise_market','order_id',v_order.id,'order_discount_gross',coalesce(v_order.discount_amount,0),'discount_ratio',v_discount_ratio,'commission_base','gross','items',v_payload),now())
  on conflict(order_id) do update set
    buyer_email=excluded.buyer_email,eligible_gross=excluded.eligible_gross,amount_net=excluded.amount_net,
    status=case when market.ambassador_commission_outbox.status='sent' then 'sent' else excluded.status end,
    reason=case when market.ambassador_commission_outbox.status='sent' then market.ambassador_commission_outbox.reason else excluded.reason end,
    payload=case when market.ambassador_commission_outbox.status='sent' then market.ambassador_commission_outbox.payload else excluded.payload end,
    updated_at=now();
end;
$function$;
