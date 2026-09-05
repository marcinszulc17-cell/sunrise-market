-- Sunrise Verify: porzucone płatności (audyt 2026-09-05). Zlecenie w statusie payment_pending, którego nikt nie
-- opłacił przez 24 h (tyle żyje sesja Stripe Checkout), przechodzi w 'cancelled' — sweeper przestaje je co minutę
-- odpytywać w Stripe, a klient widzi w panelu „Anulowane” zamiast wiecznego „Oczekuje na płatność”.
create or replace function market.expire_abandoned_verify_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update market.verification_requests
     set status = 'cancelled',
         error_message = coalesce(error_message, 'Płatność nie została dokończona w ciągu 24 h'),
         updated_at = now()
   where status = 'payment_pending'
     and created_at < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function market.expire_abandoned_verify_payments() from public;

select cron.unschedule(jobid) from cron.job where jobname = 'market-expire-verify-payments';
select cron.schedule('market-expire-verify-payments', '23 * * * *', $$select market.expire_abandoned_verify_payments()$$);
