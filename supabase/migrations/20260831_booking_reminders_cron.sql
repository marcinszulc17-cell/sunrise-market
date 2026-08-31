create or replace function market.enqueue_booking_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select b.id
    from market.bookings b
    where b.status = 'confirmed'
      and b.starts_at > now()
      and b.starts_at <= now() + interval '24 hours'
  loop
    perform market.enqueue_booking_emails(r.id, 'reminder');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function market.enqueue_booking_reminders() from public;
revoke execute on function market.enqueue_booking_reminders() from anon, authenticated;
grant execute on function market.enqueue_booking_reminders() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'booking-reminders'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'booking-reminders',
  '*/15 * * * *',
  'select market.enqueue_booking_reminders();'
);
