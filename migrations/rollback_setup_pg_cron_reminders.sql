-- Rollback for setup_pg_cron_reminders.sql. Re-enable the cron-job.org job afterwards.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'haydebot-daily-reminders';
DROP FUNCTION IF EXISTS haydebot_private.call_daily_reminders(boolean);
DROP SCHEMA IF EXISTS haydebot_private;
DELETE FROM vault.secrets WHERE name = 'haydebot_cron_secret';
-- Extensions are left installed (harmless, free). To remove them as well, only if no other
-- cron jobs / pg_net users exist:
--   select count(*) from cron.job;          -- must be 0
--   DROP EXTENSION IF EXISTS pg_cron; DROP EXTENSION IF EXISTS pg_net;
