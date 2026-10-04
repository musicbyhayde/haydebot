-- Rollback for add_dashboard_users_table.sql
-- The backend falls back to its built-in list when the table is missing, so the dashboard keeps
-- working (as long as the backend still contains the fallback).
-- Refuses to run while is_dashboard_user() exists: RLS policies on leads/messages/activities
-- would break. Run rollback_add_is_dashboard_user_rls.sql first.
begin;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'is_dashboard_user') then
    raise exception 'public.is_dashboard_user() still exists - run rollback_add_is_dashboard_user_rls.sql first';
  end if;
end $$;

drop table if exists public.dashboard_users;

commit;
