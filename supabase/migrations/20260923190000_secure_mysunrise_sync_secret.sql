-- Replace the historical hardcoded x-sync-secret with the database-held random cron_worker_secret.

select cron.alter_job(
  7,
  command := $cmd$
    select net.http_post(
      url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/mysunrise-sync',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZWhuY2Fhb2tid2JkcWR6dG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUyMDMsImV4cCI6MjA5NzY2MTIwM30.jZCKRCmzNRymVoeSJfXuL6v3qemE8NfV5qmNvpFjqi8',
        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZWhuY2Fhb2tid2JkcWR6dG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUyMDMsImV4cCI6MjA5NzY2MTIwM30.jZCKRCmzNRymVoeSJfXuL6v3qemE8NfV5qmNvpFjqi8',
        'x-sync-secret',(select value from market.internal_secrets where key='cron_worker_secret')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
