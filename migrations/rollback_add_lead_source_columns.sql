-- Rollback for add_lead_source_columns.sql (improvement #2).
-- Roll the code back first (main before feat/lead-source); the old code never reads these columns.
-- WARNING: drops all detected/backfilled source data. Optional backup first:
--   create table public.leads_source_backup_20261005 as
--     select id, "Lead_Source", "Source_Detail", "Campaign_ID", "Campaign_Name", "Adset_ID", "Adset_Name",
--            "Ad_ID", "Ad_Name", "Form_ID", "Form_Name", "UTM_Source", "UTM_Medium", "UTM_Campaign",
--            "UTM_Content", "CTWA_CLID", "Meta_Lead_ID", "Source_Referral", "Form_Answers", "Source_Detected_At"
--     from public.leads where "Lead_Source" is not null or "Source_Referral" is not null;
begin;
drop index if exists public.leads_meta_lead_id_uniq;
drop index if exists public.leads_lead_source_idx;
alter table public.leads drop constraint if exists leads_lead_source_check;
alter table public.leads
  drop column if exists "Source_Detected_At",
  drop column if exists "Form_Answers",
  drop column if exists "Source_Referral",
  drop column if exists "Meta_Lead_ID",
  drop column if exists "CTWA_CLID",
  drop column if exists "UTM_Content",
  drop column if exists "UTM_Campaign",
  drop column if exists "UTM_Medium",
  drop column if exists "UTM_Source",
  drop column if exists "Form_Name",
  drop column if exists "Form_ID",
  drop column if exists "Ad_Name",
  drop column if exists "Ad_ID",
  drop column if exists "Adset_Name",
  drop column if exists "Adset_ID",
  drop column if exists "Campaign_Name",
  drop column if exists "Campaign_ID",
  drop column if exists "Source_Detail",
  drop column if exists "Lead_Source";
commit;
