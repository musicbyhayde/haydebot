-- Rollback for add_event_day.sql (+ backfill). Drops only the derived columns, their
-- indexes and the parser; the original text columns (Event_Date, Due_Date) are untouched.
-- Deploy order: revert the app code first (or leave it: it detects the missing columns and
-- falls back to text-only writes).
DROP INDEX IF EXISTS public.leads_event_day_idx;
DROP INDEX IF EXISTS public.tasks_due_day_idx;
ALTER TABLE public.leads DROP COLUMN IF EXISTS "Event_Day";
ALTER TABLE public.tasks DROP COLUMN IF EXISTS "Due_Day";
DROP FUNCTION IF EXISTS public.haydebot_parse_day(text);
