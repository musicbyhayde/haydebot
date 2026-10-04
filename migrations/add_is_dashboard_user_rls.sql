-- Migration: limit the direct (Realtime/REST) SELECT policies on leads, messages, activities to
-- active rows of public.dashboard_users instead of "any authenticated user" (using (true)).
-- Created on: 2026-10-04
-- Requires: add_dashboard_users_table.sql (aborts if the table has no active users).
-- Safe to run more than once. Rollback: migrations/rollback_add_is_dashboard_user_rls.sql

begin;

create or replace function public.is_dashboard_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_users du
    where du.active
      and du.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_dashboard_user() from public, anon;
grant execute on function public.is_dashboard_user() to authenticated, service_role;

do $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from public.dashboard_users where active) then
    raise exception 'public.dashboard_users has no active users - aborting (would lock everyone out)';
  end if;
  -- only the permissive "authenticated using (true)" SELECT policies; nothing else is touched
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('leads', 'messages', 'activities')
      and cmd = 'SELECT'
      and 'authenticated' = any (roles)
      and qual = 'true'
  loop
    execute format('alter policy %I on public.%I using ((select public.is_dashboard_user()))',
                   r.policyname, r.tablename);
    raise notice 'updated policy % on %', r.policyname, r.tablename;
    n := n + 1;
  end loop;
  raise notice '% policies updated', n;
end $$;

commit;

-- Check (expect one SELECT policy per table, qual mentioning is_dashboard_user):
-- select tablename, policyname, roles, cmd, qual from pg_policies
--  where schemaname = 'public' and tablename in ('leads','messages','activities') order by 1, 2;
