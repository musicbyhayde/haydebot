-- SQL Migration to add Follow_Up_Completed column to notes table
-- Run this script in the Supabase SQL Editor

ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS "Follow_Up_Completed" BOOLEAN DEFAULT FALSE;

-- Optional: If you want to mark all past follow ups as completed to avoid a massive backlog popup on first load:
-- UPDATE public.notes
-- SET "Follow_Up_Completed" = TRUE
-- WHERE "Follow_Up_Date" IS NOT NULL AND "Follow_Up_Date" < CURRENT_DATE;
