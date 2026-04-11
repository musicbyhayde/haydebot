-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This adds the missing columns for Quote Data and Musician RSVPs

ALTER TABLE leads ADD COLUMN IF NOT EXISTS "Quote_Data" jsonb DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "Musician_RSVPs" jsonb DEFAULT NULL;
