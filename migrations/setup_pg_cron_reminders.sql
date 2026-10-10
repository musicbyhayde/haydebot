-- Replace the external cron-job.org trigger with Supabase pg_cron + pg_net.  PREPARED, NOT RUN.
--
-- What it replicates (from the code; the only cron-triggered endpoint in the app):
--   GET https://orca-app-g9jyu.ondigitalocean.app/api/v1/cron/reminders
--   Header: Authorization: Bearer <CRON_SECRET>   (app/api/routes.py send_daily_reminders)
--   Intended schedule: daily 08:00 Asia/Jerusalem (docstring + observed call at 08:00 IL).
--   -> Ilan: confirm the real cron-job.org job list/schedule before running (see bottom).
--
-- Time zone: pg_cron on this project runs in GMT (cron.timezone = GMT) and Israel switches
-- between UTC+3 (IDT) and UTC+2 (IST). The job therefore fires at 05:00 AND 06:00 UTC and
-- the function only calls the API when it is 08:xx in Asia/Jerusalem -> exactly one call/day
-- at 08:00 local, all year, with no edits at DST changes.
--
-- Secret: never in the repo. Store it once in Supabase Vault (step 0, run by hand in the
-- SQL editor with the real value pasted; it is the same value as CRON_SECRET in DigitalOcean):
--     select vault.create_secret('<paste CRON_SECRET>', 'haydebot_cron_secret',
--                                'Bearer secret for /api/v1/cron/reminders');
-- To rotate later: select vault.update_secret(id, '<new>') ... (and change DO CRON_SECRET).
--
-- Run order: step 0 (vault) -> this file -> verify next morning -> disable cron-job.org job.
-- Rollback: rollback_setup_pg_cron_reminders.sql (+ re-enable the cron-job.org job).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Private schema: NOT exposed by PostgREST (unlike public), so the function is not an RPC.
CREATE SCHEMA IF NOT EXISTS haydebot_private;
REVOKE ALL ON SCHEMA haydebot_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION haydebot_private.call_daily_reminders(force boolean DEFAULT false)
RETURNS bigint                        -- pg_net request id (see net._http_response), NULL if skipped
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  -- DST gate: run only at 08:xx Israel time (the job fires at 05:00 and 06:00 UTC).
  IF NOT force AND extract(hour FROM (now() AT TIME ZONE 'Asia/Jerusalem')) <> 8 THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets WHERE name = 'haydebot_cron_secret' LIMIT 1;
  IF secret IS NULL OR secret = '' THEN
    RAISE WARNING 'haydebot: vault secret haydebot_cron_secret missing, reminders not sent';
    RETURN NULL;
  END IF;
  SELECT net.http_get(
           url := 'https://orca-app-g9jyu.ondigitalocean.app/api/v1/cron/reminders',
           headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
           timeout_milliseconds := 60000   -- endpoint sends WhatsApp messages; default 5s is too short
         ) INTO req_id;
  RETURN req_id;
END
$$;

REVOKE ALL ON FUNCTION haydebot_private.call_daily_reminders(boolean) FROM PUBLIC, anon, authenticated;

-- (Re)create the job idempotently.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'haydebot-daily-reminders';
SELECT cron.schedule('haydebot-daily-reminders', '0 5,6 * * *',
                     'select haydebot_private.call_daily_reminders()');

-- ── Verify (read-only) ──────────────────────────────────────────────────────────────
-- select jobid, jobname, schedule, active from cron.job where jobname like 'haydebot-%';
-- next morning:
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname='haydebot-daily-reminders')
--   order by start_time desc limit 4;
-- select id, status_code, left(content::text, 200), created from net._http_response
--   order by created desc limit 4;      -- expect one 200 per day (the other run is skipped)
-- Manual test (sends the real WhatsApp reminders!): select haydebot_private.call_daily_reminders(true);
--
-- ── Ilan to confirm before running ──────────────────────────────────────────────────
-- 1. cron-job.org: list every job (URL, method, headers, schedule + its time zone). This file
--    covers only /api/v1/cron/reminders. Any other job (e.g. a keep-alive ping of /) needs a
--    line added here or can simply be dropped (DO does not sleep).
-- 2. The schedule really is 08:00 Israel time, every day incl. Fri/Sat.
-- 3. Disable the cron-job.org job right after this runs, otherwise reminders arrive twice.
