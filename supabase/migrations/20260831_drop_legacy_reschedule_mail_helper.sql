-- Rescheduled booking emails use the canonical enqueue_booking_emails()
-- path through booking_mail_trigger(). This helper was left behind by an
-- earlier iteration and has no function, trigger or cron dependencies.
drop function if exists market.enqueue_booking_rescheduled_emails(uuid,text);
