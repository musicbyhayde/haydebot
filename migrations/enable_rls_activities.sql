-- Migration: Enable Row Level Security (RLS) for activities table
-- Created on: 2026-04-24
-- Purpose: Resolve Supabase security warning and secure the activity log.

-- 1. Enable RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Allow authenticated users to view logs
-- This ensures that the dashboard can display activity history for logged-in users.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'activities' AND policyname = 'Allow authenticated users to view activities'
    ) THEN
        CREATE POLICY "Allow authenticated users to view activities" 
        ON public.activities 
        FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;
END $$;

-- 3. Policy: Allow authenticated users to insert activities
-- This allows the application to log new actions performed by users.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'activities' AND policyname = 'Allow authenticated users to insert activities'
    ) THEN
        CREATE POLICY "Allow authenticated users to insert activities" 
        ON public.activities 
        FOR INSERT 
        TO authenticated 
        WITH CHECK (true);
    END IF;
END $$;
