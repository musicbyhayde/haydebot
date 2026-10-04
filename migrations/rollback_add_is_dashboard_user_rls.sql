-- Rollback for add_is_dashboard_user_rls.sql: back to "authenticated using (true)".
begin;

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('leads', 'messages', 'activities')
      and cmd = 'SELECT'
      and qual like '%is_dashboard_user%'
  loop
    execute format('alter policy %I on public.%I using (true)', r.policyname, r.tablename);
    raise notice 'reverted policy % on %', r.policyname, r.tablename;
  end loop;
end $$;

drop function if exists public.is_dashboard_user();

commit;
