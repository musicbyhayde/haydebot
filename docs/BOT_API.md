# Bot API (`/api/bot/v1`) - read-only, vendor-neutral

Plain HTTPS + JSON for any bot or AI agent (Grok, ChatGPT, Claude, n8n, scripts). No middle layer.

- **Auth:** `Authorization: Bearer <key>` - one key per bot, stored only as SHA-256 in
  `public.bot_api_keys` (`migrations/add_bot_api_tables.sql`). Not valid on `/api/v1`; the
  dashboard JWT / `API_KEY` are not valid here.
- **Self-description:** `GET /api/bot/v1/guide` (JSON, or `?format=markdown`) and
  `GET /api/bot/v1/openapi.json` (OpenAPI 3.1, bot routes only, importable as tools).
- **Responses:** `{data: ...}`; lists add `page: {total, limit, offset, next_offset}`.
  **Errors:** `{error: {status, code, message}}`.
- **Read-only:** GET only. No sending messages to customers, no writes, no full backup.
  `notes:write` / `tasks:write` are reserved names for a later phase.
- **Scopes:** `leads:read, messages:read, notes:read, tasks:read, musicians:read,
  finance:summary, finance:read, pii:read` (`python scripts/bot_keys.py scopes`).
- **Safety:** `BOT_API_ENABLED` kill switch (default off), per-key + per-IP rate limits, audit row per
  request in `public.bot_audit_log`, revoke = `active=false` (applies within ~60s), optional `expires_at`.

## Keys
```
python scripts/bot_keys.py create --name grok --scopes default --expires-days 180   # prints key once + SQL
python scripts/bot_keys.py revoke --name grok                                        # prints SQL
python scripts/bot_keys.py list --apply                                              # needs SUPABASE_URL/KEY
```

## Quick test
```
curl -H "Authorization: Bearer $KEY" https://<host>/api/bot/v1/whoami
curl -H "Authorization: Bearer $KEY" "https://<host>/api/bot/v1/guide?format=markdown"
```

## Later (not built)
Optional thin adapters on top of this API - e.g. an MCP server or a Telegram bot - each using its own
bot key. They add convenience only; the API stays the single source.
