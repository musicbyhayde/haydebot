-- Backfill Event_Day / Due_Day from the text columns. Run AFTER add_event_day.sql.
-- Only fills rows where the day is still NULL, never touches the text columns.
-- Step 1 (DRY RUN, read-only): run the SELECTs and review the counts / unparsed shapes.
-- Step 2: run the UPDATE block. Undo: UPDATE ... SET "Event_Day" = NULL (or rollback_add_event_day.sql).

-- ── Step 1: dry run ─────────────────────────────────────────────────────────────────
SELECT 'leads' AS tbl,
       count(*) FILTER (WHERE coalesce(btrim("Event_Date"), '') <> '') AS with_text,
       count(*) FILTER (WHERE public.haydebot_parse_day("Event_Date") IS NOT NULL) AS parsed,
       count(*) FILTER (WHERE coalesce(btrim("Event_Date"), '') <> ''
                          AND public.haydebot_parse_day("Event_Date") IS NULL) AS unparsed
FROM public.leads
UNION ALL
SELECT 'tasks',
       count(*) FILTER (WHERE coalesce(btrim("Due_Date"), '') <> ''),
       count(*) FILTER (WHERE public.haydebot_parse_day("Due_Date") IS NOT NULL),
       count(*) FILTER (WHERE coalesce(btrim("Due_Date"), '') <> ''
                          AND public.haydebot_parse_day("Due_Date") IS NULL)
FROM public.tasks;

-- Unparsed values, as shapes only (digits -> 9, Hebrew words -> ע): no names/phones.
SELECT 'leads' AS tbl,
       regexp_replace(regexp_replace("Event_Date", '[0-9]', '9', 'g'), '[א-ת]+', 'ע', 'g') AS shape,
       count(*)
FROM public.leads
WHERE coalesce(btrim("Event_Date"), '') <> '' AND public.haydebot_parse_day("Event_Date") IS NULL
GROUP BY 2
UNION ALL
SELECT 'tasks', regexp_replace(regexp_replace("Due_Date", '[0-9]', '9', 'g'), '[א-ת]+', 'ע', 'g'), count(*)
FROM public.tasks
WHERE coalesce(btrim("Due_Date"), '') <> '' AND public.haydebot_parse_day("Due_Date") IS NULL
GROUP BY 2
ORDER BY 1, 3 DESC;

-- ── Step 2: apply ───────────────────────────────────────────────────────────────────
BEGIN;
UPDATE public.leads SET "Event_Day" = public.haydebot_parse_day("Event_Date")
 WHERE "Event_Day" IS NULL AND public.haydebot_parse_day("Event_Date") IS NOT NULL;
UPDATE public.tasks SET "Due_Day" = public.haydebot_parse_day("Due_Date")
 WHERE "Due_Day" IS NULL AND public.haydebot_parse_day("Due_Date") IS NOT NULL;
-- check: numbers must equal the dry-run "parsed" counts
SELECT (SELECT count(*) FROM public.leads WHERE "Event_Day" IS NOT NULL) AS leads_with_day,
       (SELECT count(*) FROM public.tasks WHERE "Due_Day" IS NOT NULL) AS tasks_with_day;
COMMIT;
