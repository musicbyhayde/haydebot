-- Migration: partner transfers ("העברה בין שותפים", Ilan 2026-10-08).
-- Created on: 2026-10-08. Rollback: migrations/rollback_add_finance_transfers.sql
-- Additive only: a NEW table. public.finance and every existing row stay exactly as they are.
-- Safe to run more than once.
--
-- A transfer moves money from one partner's pool to another partner's pool
-- (pool = partner x payment method: 'מזומן' cash / 'חשבון' bank-credit-transfer).
-- It changes the per-partner balance (יתרה) and the cash/bank pools in GET /finance/summary;
-- income, expenses and profit never change (app/services/finance_transfers.py).
--
-- DEPLOY ORDER: run this first. The backend reads the table only when it exists
-- (the summary ignores a missing table), so this migration alone changes nothing.
-- Access: backend only (service role). RLS on, no grants for anon / authenticated.
-- Partner names are validated by the backend against the existing partner list (no list here).

begin;

create table if not exists public.finance_transfers (
  id              text primary key,
  transfer_date   date not null,
  amount          numeric(12, 2) not null,
  from_partner    text not null,
  from_pool       text not null,
  to_partner      text not null,
  to_pool         text not null,
  note            text,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_by      text,
  updated_at      timestamptz,
  archived_at     timestamptz,
  archived_by     text,
  archive_reason  text,
  constraint finance_transfers_amount_positive check (amount > 0),
  constraint finance_transfers_from_pool check (from_pool in ('מזומן', 'חשבון')),
  constraint finance_transfers_to_pool check (to_pool in ('מזומן', 'חשבון')),
  constraint finance_transfers_two_partners check (from_partner <> to_partner),
  constraint finance_transfers_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists finance_transfers_active_date_idx
  on public.finance_transfers (transfer_date desc) where archived_at is null;

alter table public.finance_transfers enable row level security;
revoke all on public.finance_transfers from anon, authenticated;

commit;

-- Checks:
-- select count(*) from public.finance_transfers;                          -> 0
-- select relrowsecurity from pg_class where oid = 'public.finance_transfers'::regclass;  -> true
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'finance_transfers'
--    and grantee in ('anon', 'authenticated');                              -> no rows
