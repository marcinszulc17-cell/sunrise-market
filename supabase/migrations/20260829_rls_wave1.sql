-- First RLS protection wave for high-risk Market tables.
-- This intentionally protects only tables that are already accessed through
-- SECURITY DEFINER RPCs or Edge Functions using the service role.

alter table market.verification_requests enable row level security;
alter table market.offer_leads enable row level security;

-- verification_requests: no direct anon/authenticated access.
-- Access is through verify-checkout / verify-status Edge Functions only.
revoke all on table market.verification_requests from anon, authenticated;

-- offer_leads: no direct anon/authenticated access.
-- Lead creation / seller pipeline use SECURITY DEFINER RPCs.
revoke all on table market.offer_leads from anon, authenticated;

-- Prevent sellers from bypassing buyer confirmation and marking a lead as
-- sold_confirmed through the generic status RPC.
create or replace function market.set_offer_lead_status(p_lead uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_status not in ('new','contacted','offer','reserved','sold_declared','closed') then
    raise exception 'Nieprawidlowy status';
  end if;

  update market.offer_leads l
     set status=p_status, updated_at=now()
   where l.id=p_lead
     and exists (
       select 1 from market.sellers s
       where s.id=l.seller_id and lower(s.email)=v_email
     );
  if not found then raise exception 'Brak dostepu'; end if;
end;
$$;

revoke all on function market.set_offer_lead_status(uuid,text) from public, anon;
grant execute on function market.set_offer_lead_status(uuid,text) to authenticated;
