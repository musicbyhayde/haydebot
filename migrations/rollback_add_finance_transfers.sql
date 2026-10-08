-- Rollback of migrations/add_finance_transfers.sql (partner transfers).
-- Revert the backend first (or it logs a warning and shows the summary without transfers).
--
-- Refuses while the table has rows, so no transfer is ever lost by accident.
-- If transfers exist and the feature must go away, keep the data instead of dropping it:
--   alter table public.finance_transfers rename to finance_transfers_archived_YYYYMMDD;
-- (the backend then simply finds no table and ignores transfers).

begin;

do $$
declare
  has_rows boolean := false;
begin
  if to_regclass('public.finance_transfers') is not null then
    execute 'select exists (select 1 from public.finance_transfers)' into has_rows;
  end if;
  if has_rows then
    raise exception 'public.finance_transfers has rows - not dropping (rename it instead, see header)';
  end if;
end $$;

drop table if exists public.finance_transfers;

commit;
