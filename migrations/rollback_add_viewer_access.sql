-- Rollback for add_viewer_access.sql: back to the state of 2026-10-05 before viewer access.
-- FIRST remove viewer accounts (admin screen "משתמשים" -> delete, or the Supabase Auth dashboard),
-- then roll back the backend if needed. This script refuses to run while viewer rows exist,
-- because the restored role check would not allow them.

begin;

do $$
begin
  if exists (select 1 from public.dashboard_users where role = 'viewer') then
    raise exception 'viewer rows still exist in public.dashboard_users - delete them first';
  end if;
end $$;

-- 1) role check as before
alter table public.dashboard_users drop constraint if exists dashboard_users_role_check;
alter table public.dashboard_users add constraint dashboard_users_role_check
  check (role in ('admin', 'partner'));

-- 3) + 4) original "any authenticated user" SELECT policies
drop policy if exists "Active dashboard users can read leads" on public.leads;
drop policy if exists "Signed-in users can read leads" on public.leads;
create policy "Signed-in users can read leads" on public.leads
  for select to authenticated using (true);

drop policy if exists "Active dashboard users can read messages" on public.messages;
drop policy if exists "Signed-in users can read messages" on public.messages;
create policy "Signed-in users can read messages" on public.messages
  for select to authenticated using (true);

drop policy if exists "Signed-in users can view activities" on public.activities;
create policy "Signed-in users can view activities" on public.activities
  for select to authenticated using (true);

-- 2) helper (no policy uses it any more)
drop function if exists public.is_dashboard_user();

-- 5) the grants that existed before (exactly these 9 tables)
grant insert, update, delete, truncate, references, trigger
  on public.activities, public.business_contacts, public.finance, public.leads, public.messages,
     public.musicians, public.notes, public.tasks, public.videos
  to anon, authenticated;

-- 6) audit log: kept by default (history). To remove it too, uncomment:
-- drop table if exists public.dashboard_audit_log;

commit;
