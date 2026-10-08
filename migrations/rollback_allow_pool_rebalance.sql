-- Rollback of migrations/allow_pool_rebalance.sql.
-- Refuses while same-partner transfers exist, so no rebalance row is ever left behind a
-- constraint that would reject it. Archive or remove those rows first, then run again.

begin;

do $$
begin
  if to_regclass('public.finance_transfers') is not null then
    if exists (select 1 from public.finance_transfers where from_partner = to_partner) then
      raise exception 'finance_transfers has same-partner rows - not restoring the two-partners constraint';
    end if;
  end if;
end $$;

alter table public.finance_transfers drop constraint if exists finance_transfers_distinct_sides;

do $$
begin
  if to_regclass('public.finance_transfers') is not null and not exists (
    select 1 from pg_constraint
    where conname = 'finance_transfers_two_partners' and conrelid = 'public.finance_transfers'::regclass
  ) then
    alter table public.finance_transfers add constraint finance_transfers_two_partners
      check (from_partner <> to_partner);
  end if;
end $$;

commit;
