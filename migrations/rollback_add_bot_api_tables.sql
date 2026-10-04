-- Rollback for add_bot_api_tables.sql. Deletes all bot keys and the bot audit history.
-- First set BOT_API_ENABLED=false (or roll back the code); with the tables gone every key is rejected anyway.
begin;
drop table if exists public.bot_audit_log;
drop table if exists public.bot_api_keys;
commit;
