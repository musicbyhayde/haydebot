-- Migration: dashboard_users — who may use the HaydeBot dashboard (replaces hard-coded lists)
-- Created on: 2026-10-04
-- Safe to run more than once. Run BEFORE or AFTER deploying the matching backend code:
-- while this table is missing or empty, the backend falls back to the previous built-in list.
-- Rollback: migrations/rollback_add_dashboard_users_table.sql

begin;

create table if not exists public.dashboard_users (
    email        text primary key check (email = lower(email) and position('@' in email) > 1),
    role         text not null check (role in ('admin', 'partner')),
    display_name text not null check (length(trim(display_name)) > 0),
    active       boolean not null default true,
    created_at   timestamptz not null default now()
);

comment on table public.dashboard_users is
  'Dashboard users. Read by the backend with the service key (/api/v1/me, auth). '
  'display_name is also the Owner/Assignee value used across leads/finance/tasks - keep it stable.';

-- Only the backend (service role, bypasses RLS) reads this table.
-- RLS on with NO policies + no table privileges => anon/authenticated get nothing.
alter table public.dashboard_users enable row level security;
revoke all on table public.dashboard_users from anon, authenticated;

-- Seed: the current users exactly as they were hard-coded in frontend/lib/allowedUsers.ts.
-- ON CONFLICT DO NOTHING: re-running never overwrites later edits.
insert into public.dashboard_users (email, role, display_name) values
    ('ziv200@gmail.com',       'admin',   'אילן'),
    ('kobile@gmail.com',       'partner', 'קובי'),
    ('musicbyhayde@gmail.com', 'admin',   'מנהל')
on conflict (email) do nothing;

commit;

-- Check (expect 3 rows, all active):
-- select email, role, display_name, active from public.dashboard_users order by email;
