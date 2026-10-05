-- Migration: read-only "viewer" dashboard users + database-level hardening (viewer access plan).
-- Created on: 2026-10-05. Rollback: migrations/rollback_add_viewer_access.sql
-- Supersedes the never-applied add_is_dashboard_user_rls.sql (same function, same policy idea).
-- Safe to run more than once. Does NOT change the existing dashboard_users rows.
--
-- DEPLOY ORDER: the backend with viewer enforcement (app/core/permissions.py) must be live before
-- any row with role 'viewer' exists. This migration only ALLOWS the value; viewers are created later
-- from the admin screen. Running it before or after that backend deploy is both fine.
--
-- 1) dashboard_users.role may be 'viewer'
-- 2) public.is_dashboard_user(): the caller's JWT email is an active dashboard user
-- 3) direct (PostgREST / Realtime) reads of leads + messages only for active dashboard users
--    (was: any authenticated user) -> a disabled user or any other Supabase account reads nothing,
--    even with a still-valid access token
-- 4) no direct reads of activities (the dashboard reads them through the backend, which hides
--    finance entries without a lead from viewers)
-- 5) revoke the unused direct write grants of anon/authenticated (RLS already blocks writes)
-- 6) public.dashboard_audit_log (service role only): sessions, blocked viewer requests, user admin

begin;

do $$
begin
  if not exists (select 1 from public.dashboard_users where active and role = 'admin') then
    raise exception 'public.dashboard_users has no active admin - aborting (would lock everyone out)';
  end if;
end $$;

-- 1) role 'viewer'
alter table public.dashboard_users drop constraint if exists dashboard_users_role_check;
alter table public.dashboard_users add constraint dashboard_users_role_check
  check (role in ('admin', 'partner', 'viewer'));

-- 2) helper for RLS
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

-- 3) leads + messages: SELECT only for active dashboard users (Realtime keeps working for them)
drop policy if exists "Signed-in users can read leads" on public.leads;
drop policy if exists "Active dashboard users can read leads" on public.leads;
create policy "Active dashboard users can read leads" on public.leads
  for select to authenticated using ((select public.is_dashboard_user()));

drop policy if exists "Signed-in users can read messages" on public.messages;
drop policy if exists "Active dashboard users can read messages" on public.messages;
create policy "Active dashboard users can read messages" on public.messages
  for select to authenticated using ((select public.is_dashboard_user()));

-- 4) activities: no direct reads (RLS stays enabled, no policy = service role only)
drop policy if exists "Signed-in users can view activities" on public.activities;

-- 5) direct writes: never used (backend = service role); RLS blocked them already
revoke insert, update, delete, truncate, references, trigger
  on public.activities, public.business_contacts, public.finance, public.leads, public.messages,
     public.musicians, public.notes, public.tasks, public.videos
  from anon, authenticated;

-- 6) audit log
create table if not exists public.dashboard_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,
  email text,
  role text,
  method text,
  path text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists dashboard_audit_log_created_at_idx on public.dashboard_audit_log (created_at desc);
create index if not exists dashboard_audit_log_email_idx on public.dashboard_audit_log (email, created_at desc);
alter table public.dashboard_audit_log enable row level security;
revoke all on public.dashboard_audit_log from anon, authenticated;

commit;

-- Checks:
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'dashboard_users_role_check';
-- select tablename, policyname, roles, cmd, qual from pg_policies
--  where schemaname = 'public' and tablename in ('leads','messages','activities') order by 1, 2;
--   -> leads + messages: one SELECT policy each with is_dashboard_user(); activities: none
-- select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated') group by 1, 2 order by 1, 2;
--   -> only SELECT left on the 9 tables
-- select role, display_name, active from public.dashboard_users order by 1, 2;   -> unchanged 3 rows
