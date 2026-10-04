-- Migration: tables for the read-only Bot API (/api/bot/v1)
--   public.bot_api_keys  - one row per bot/agent; only a SHA-256 hash of the key is stored
--   public.bot_audit_log - one row per bot API request
-- Created on: 2026-10-04
-- Safe to run more than once. Run BEFORE deploying the matching code (the API stays off until
-- BOT_API_ENABLED=true anyway; without the table every key is simply rejected).
-- Rollback: migrations/rollback_add_bot_api_tables.sql
-- Keys are created with scripts/bot_keys.py (prints the key once + an INSERT with the hash).

begin;

create table if not exists public.bot_api_keys (
    id                 uuid primary key default gen_random_uuid(),
    name               text not null unique check (name ~ '^[a-z0-9][a-z0-9_.-]{1,48}$'),
    key_hash           text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),   -- sha256(key) hex
    key_prefix         text not null,                                             -- e.g. hbk_1a2b3c4d (not secret)
    scopes             text[] not null default '{}',
    active             boolean not null default true,
    rate_limit_per_min integer check (rate_limit_per_min is null or rate_limit_per_min between 1 and 600),
    created_at         timestamptz not null default now(),
    last_used_at       timestamptz,
    expires_at         timestamptz,
    notes              text
);

comment on table public.bot_api_keys is
  'Per-bot API keys for /api/bot/v1 (read-only). Only sha256(key) is stored. '
  'Revoke: update ... set active=false (effective within ~60s).';

create table if not exists public.bot_audit_log (
    id          bigint generated always as identity primary key,
    ts          timestamptz not null default now(),
    key_id      uuid,               -- no FK: audit rows outlive deleted keys
    bot_name    text,               -- null = request without a valid key
    method      text not null,
    path        text not null,
    params      jsonb,              -- query params, values truncated; never the key
    status      integer not null,
    latency_ms  integer,
    error_code  text,
    ip          text,
    user_agent  text
);

create index if not exists bot_audit_log_ts_idx on public.bot_audit_log (ts desc);
create index if not exists bot_audit_log_key_ts_idx on public.bot_audit_log (key_id, ts desc);

comment on table public.bot_audit_log is
  'One row per /api/bot/v1 request. Retention suggestion: '
  'delete from public.bot_audit_log where ts < now() - interval ''180 days'';';

-- Only the backend (service role, bypasses RLS) uses these tables.
alter table public.bot_api_keys  enable row level security;
alter table public.bot_audit_log enable row level security;
revoke all on table public.bot_api_keys  from anon, authenticated;
revoke all on table public.bot_audit_log from anon, authenticated;

commit;

-- Check:
-- select name, key_prefix, scopes, active, expires_at, last_used_at from public.bot_api_keys order by name;
-- select ts, bot_name, method, path, status, latency_ms, error_code from public.bot_audit_log order by ts desc limit 20;
