-- Real calendar-day columns next to the free-text dates (text stays untouched for display/notes).
--   leads.Event_Day  <- parsed from leads.Event_Date
--   tasks.Due_Day    <- parsed from tasks.Due_Date
-- Additive and idempotent. The app writes both columns once this has run; until then it
-- detects the missing column and keeps writing text only. Backfill: backfill_event_day.sql.
-- Rollback: rollback_add_event_day.sql.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "Event_Day" date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "Due_Day" date;

CREATE INDEX IF NOT EXISTS leads_event_day_idx ON public.leads ("Event_Day");
CREATE INDEX IF NOT EXISTS tasks_due_day_idx ON public.tasks ("Due_Day");

-- Same rules as app/core/dates.py:parse_event_date (keep the two in sync):
-- leading "(...)" note ignored, ISO preferred, else D.M.Y / D/M/Y / D-M-Y with 2- or 4-digit
-- year (2-digit -> 20xx), first date-like token wins, years outside 2000-2100 and
-- impossible dates -> NULL.
CREATE OR REPLACE FUNCTION public.haydebot_parse_day(t text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  s text; core text; src text; m text[]; y int; mo int; d int;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  s := btrim(t);
  core := regexp_replace(s, '^\s*\([^)]*\)\s*', '');
  IF core = '' THEN core := s; END IF;
  FOREACH src IN ARRAY ARRAY[core, s] LOOP
    m := regexp_match(src, '(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)');
    IF m IS NOT NULL THEN
      y := m[1]::int; mo := m[2]::int; d := m[3]::int;
    ELSE
      m := regexp_match(src, '(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)');
      IF m IS NULL THEN CONTINUE; END IF;
      d := m[1]::int; mo := m[2]::int; y := m[3]::int;
      IF length(m[3]) = 2 THEN y := y + 2000; END IF;
    END IF;
    IF y < 2000 OR y > 2100 THEN RETURN NULL; END IF;
    BEGIN
      RETURN make_date(y, mo, d);
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END LOOP;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.haydebot_parse_day(text) FROM PUBLIC, anon, authenticated;
