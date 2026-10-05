-- Migration: lead source / attribution columns (improvement #2)
-- Created on: 2026-10-05
-- Run BEFORE deploying the feat/lead-source code (the code tolerates missing columns, but then
-- logs an update_lead error for every new lead and stores nothing).
-- All columns are nullable, no defaults, no data change: existing rows are untouched.
-- Values of "Lead_Source": meta_form, ctwa, whatsapp_direct, website, referral, repeat, phone, other
-- Rollback: rollback_add_lead_source_columns.sql
begin;

alter table public.leads add column if not exists "Lead_Source"        text;
alter table public.leads add column if not exists "Source_Detail"      text;
alter table public.leads add column if not exists "Campaign_ID"        text;
alter table public.leads add column if not exists "Campaign_Name"      text;
alter table public.leads add column if not exists "Adset_ID"           text;
alter table public.leads add column if not exists "Adset_Name"         text;
alter table public.leads add column if not exists "Ad_ID"              text;
alter table public.leads add column if not exists "Ad_Name"            text;
alter table public.leads add column if not exists "Form_ID"            text;
alter table public.leads add column if not exists "Form_Name"          text;
alter table public.leads add column if not exists "UTM_Source"         text;
alter table public.leads add column if not exists "UTM_Medium"         text;
alter table public.leads add column if not exists "UTM_Campaign"       text;
alter table public.leads add column if not exists "UTM_Content"        text;
alter table public.leads add column if not exists "CTWA_CLID"          text;
alter table public.leads add column if not exists "Meta_Lead_ID"       text;  -- Meta leadgen id, for future dedupe
alter table public.leads add column if not exists "Source_Referral"    jsonb; -- raw WhatsApp referral object
alter table public.leads add column if not exists "Form_Answers"       jsonb; -- parsed Meta form message
alter table public.leads add column if not exists "Source_Detected_At" timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_lead_source_check') then
    alter table public.leads add constraint leads_lead_source_check check (
      "Lead_Source" is null or "Lead_Source" in
      ('meta_form','ctwa','whatsapp_direct','website','referral','repeat','phone','other'));
  end if;
end $$;

create index if not exists leads_lead_source_idx on public.leads ("Lead_Source");
create unique index if not exists leads_meta_lead_id_uniq on public.leads ("Meta_Lead_ID")
  where "Meta_Lead_ID" is not null;

comment on column public.leads."Lead_Source" is 'Lead attribution: meta_form|ctwa|whatsapp_direct|website|referral|repeat|phone|other (app/services/lead_source.py)';
comment on column public.leads."Source_Referral" is 'Raw WhatsApp click-to-WhatsApp referral object of the first message that had one';

commit;

-- Check:
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='leads'
--    and column_name in ('Lead_Source','Source_Detail','Source_Referral','Form_Answers','Meta_Lead_ID','Source_Detected_At');
