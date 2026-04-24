-- Migration: Add Referral tracking columns to leads table
-- Created on: 2026-04-24
-- Purpose: Support "Referred" lead status with commission tracking.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "Referred_To" text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "Commission_Amount" numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "Commission_Status" text DEFAULT 'ממתין';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "Commission_Includes_VAT" boolean DEFAULT false;
