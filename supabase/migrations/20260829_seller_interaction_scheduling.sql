alter table market.offer_leads add column if not exists interaction_status text default 'proposed';
alter table market.offer_leads add column if not exists interaction_reminder_sent_at timestamptz;

create or replace function market.set_interaction_schedule(p_lead uuid,p_status text,p_appointment_at timestamptz default null)
returns void language plpgsql security definer set search_path to 'market','public' as $$
declare v_user_id uuid; v_offer_id uuid; v_interaction_type text; v_seller_email text; v_status text:=lower(trim(coalesce(p_status,''))); v_title text;
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  if v_status not in ('proposed','confirmed','rescheduled','cancelled','completed') then raise exception 'Nieprawidłowy status terminu'; end if;
  select l.user_id,l.offer_id,l.interaction_type,s.email into v_user_id,v_offer_id,v_interaction_type,v_seller_email
  from market.offer_leads l join market.sellers s on s.id=l.seller_id where l.id=p_lead;
  if v_offer_id is null then raise exception 'Nie znaleziono zapytania'; end if;
  if lower(coalesce(v_seller_email,''))<>lower(coalesce(auth.jwt()->>'email','')) then raise exception 'Brak dostępu'; end if;
  if v_interaction_type is null then raise exception 'To zapytanie nie ma harmonogramu'; end if;
  if v_status in ('confirmed','rescheduled') and (p_appointment_at is null or p_appointment_at < now()+interval '30 minutes') then raise exception 'Wybierz przyszły termin'; end if;
  update market.offer_leads set interaction_status=v_status, appointment_at=case when v_status in ('confirmed','rescheduled') then p_appointment_at when v_status='cancelled' then appointment_at else coalesce(p_appointment_at,appointment_at) end, interaction_reminder_sent_at=null where id=p_lead;
  select title into v_title from market.offers where id=v_offer_id;
  if v_user_id is not null then
    insert into market.notifications(user_id,type,title,body)
    values(v_user_id,'interaction_schedule',
      case v_status when 'confirmed' then 'Termin potwierdzony' when 'rescheduled' then 'Nowy termin od sprzedawcy' when 'cancelled' then 'Termin anulowany' when 'completed' then 'Spotkanie zakończone' else 'Aktualizacja terminu' end,
      coalesce(v_title,'Oferta') || case when v_status in ('confirmed','rescheduled') then ' · '||to_char(p_appointment_at at time zone 'Europe/Warsaw','DD.MM.YYYY HH24:MI') else '' end);
  end if;
end $$;
revoke execute on function market.set_interaction_schedule(uuid,text,timestamptz) from public, anon;
grant execute on function market.set_interaction_schedule(uuid,text,timestamptz) to authenticated;

drop function if exists market.my_offer_leads_v2();
create function market.my_offer_leads_v2()
returns table(id uuid, offer_id uuid, title text, name text, email text, phone text, message text,status text, source text, interaction_type text, interaction_status text, appointment_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path to 'market','public' as $$
  select l.id,l.offer_id,o.title,l.name,l.email,l.phone,l.message,l.status,l.source,l.interaction_type,l.interaction_status,l.appointment_at,l.created_at
  from market.offer_leads l join market.offers o on o.id=l.offer_id join market.sellers s on s.id=l.seller_id
  where lower(s.email)=lower(auth.jwt()->>'email') order by l.created_at desc;
$$;
revoke execute on function market.my_offer_leads_v2() from public, anon;
grant execute on function market.my_offer_leads_v2() to authenticated;

create or replace function market.send_interaction_reminders() returns integer language plpgsql security definer set search_path to 'market','public' as $$
declare v_count integer:=0;
begin
  with due as (
    select l.id,l.user_id,l.appointment_at,o.title from market.offer_leads l join market.offers o on o.id=l.offer_id
    where l.user_id is not null and l.interaction_status in ('confirmed','rescheduled') and l.appointment_at between now()+interval '23 hours' and now()+interval '24 hours 15 minutes' and l.interaction_reminder_sent_at is null
  ), ins as (
    insert into market.notifications(user_id,type,title,body)
    select user_id,'interaction_reminder','Przypomnienie o terminie',title||' · jutro '||to_char(appointment_at at time zone 'Europe/Warsaw','HH24:MI') from due returning 1
  )
  update market.offer_leads l set interaction_reminder_sent_at=now() from due where l.id=due.id;
  get diagnostics v_count = row_count; return v_count;
end $$;
revoke execute on function market.send_interaction_reminders() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='market-interaction-reminders';
exception when others then null; end $$;
select cron.schedule('market-interaction-reminders','*/15 * * * *',$$select market.send_interaction_reminders();$$);
