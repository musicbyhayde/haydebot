-- Migration: allow rebalancing a partner's own pools (Ilan 2026-10-08).
-- Created on: 2026-10-08. Rollback: migrations/rollback_allow_pool_rebalance.sql
--
-- finance_transfers_two_partners required from_partner <> to_partner. A rebalance
-- ("אילן מזומן -> אילן חשבון") has the same partner on both sides but different pools:
-- that partner's יתרה stays, the cash/bank pools move (app/services/finance_transfers.py).
-- The same partner AND the same pool is still rejected (it would move nothing).
-- Safe to run more than once. No data changes.

begin;

alter table public.finance_transfers drop constraint if exists finance_transfers_two_partners;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_transfers_distinct_sides' and conrelid = 'public.finance_transfers'::regclass
  ) then
    alter table public.finance_transfers add constraint finance_transfers_distinct_sides
      check (from_partner <> to_partner or from_pool <> to_pool);
  end if;
end $$;

commit;

-- Checks:
-- select conname from pg_constraint where conrelid = 'public.finance_transfers'::regclass and contype = 'c';
--   -> ... finance_transfers_distinct_sides (no finance_transfers_two_partners)
