# Bot API (`/api/bot/v1`) - reads + narrow optional writes, vendor-neutral

Plain HTTPS + JSON for any bot or AI agent (Grok, ChatGPT, Claude, n8n, scripts). No middle layer.

- **Auth:** `Authorization: Bearer <key>` - one key per bot, stored only as SHA-256 in
  `public.bot_api_keys` (`migrations/add_bot_api_tables.sql`). Not valid on `/api/v1`; the
  dashboard JWT / `API_KEY` are not valid here.
- **Self-description:** `GET /api/bot/v1/guide` (JSON, or `?format=markdown`) and
  `GET /api/bot/v1/openapi.json` (OpenAPI 3.1, bot routes only, importable as tools).
- **Responses:** `{data: ...}`; lists add `page: {total, limit, offset, next_offset}`.
  **Errors:** `{error: {status, code, message}}`, always 4xx: 401 key problems, 403 scope, 404 not found
  or `bot_api_disabled`, 422 bad params, 424 database briefly unreachable (retry after `Retry-After`),
  429 rate limit. No 5xx on purpose: DigitalOcean's edge replaces any 5xx body with an HTML 504 page.
- **Never:** sending WhatsApp / any message to customers or musicians, deleting leads / notes / tasks,
  finance writes, closing a deal, Google Calendar invites, the full backup.
- **Read scopes:** `leads:read, messages:read, notes:read, tasks:read, musicians:read,
  finance:summary, finance:read, pii:read`. **Write scopes:** `notes:write, tasks:write, crew:write,
  leads:write` (`python scripts/bot_keys.py scopes`).
- **Safety:** `BOT_API_ENABLED` kill switch (default off; when off every bot route answers 404 `bot_api_disabled`), per-key + per-IP rate limits, audit row per
  request in `public.bot_audit_log`, revoke = `active=false` (applies within ~60s), optional `expires_at`.

## Writes (phase 2)
A write needs **all three**: `BOT_API_ENABLED=true`, `BOT_API_WRITE_ENABLED=true` (default false, else
403 `writes_disabled`) and the endpoint's write scope on the key. `?dry_run=true` validates and returns
what would change without writing (works even while writes are off).

| Endpoint | Scope | What it does (same tables / fields / activity texts as the dashboard) |
|---|---|---|
| `POST /leads/{id}/notes` `{content, follow_up_date?}` | notes:write | note with `Author=bot:<key name>` + activity "הוספת עדכון" |
| `PATCH /notes/{id}/follow-up` `{completed?, follow_up_date?}` | notes:write | reminder done / reopen / postpone (never the note text) |
| `POST /tasks` `{title, assignee?, due_date?, lead_id?}` | tasks:write | task (`Due_Date` stored `DD.MM.YYYY`) + activity "משימה חדשה" |
| `PATCH /tasks/{id}` `{completed?, due_date?, assignee?, title?}` | tasks:write | done / reopen / reschedule; no delete |
| `POST /leads/{id}/crew` `{musician_id, allow_conflict?}` | crew:write | append to `Musician_Team`; 409 `musician_busy` if on another event that day |
| `DELETE /leads/{id}/crew/{musician_id}` | crew:write | remove from `Musician_Team` |
| `PATCH /leads/{id}/status` `{status, lost_reason?, expected_status?}` | leads:write | Talking, Manual, Quote_Sent, Waiting_Payment, Cold, Lost; Completed only from Closed. Never Closed / New / Processing / Distributed / Assigned / Referred |
| `PATCH /leads/{id}/owner` `{owner, handover_note}` | leads:write | the dashboard's transfer: Owner + hand-over note + activity |
| `PATCH /leads/{id}/event` `{event_date?, location?, guests?}` | leads:write | event details (`Event_Date` stored `DD.MM.YYYY`) |

- **Attribution:** note author / activity actor = `bot:<key name>`; every bot write gets an activity row
  (History page), even where the dashboard logs nothing.
- **No side effects:** no WhatsApp, no Bouzouki distribution, no calendar changes (responses warn when a
  lead has a calendar event; a partner syncs it from the dashboard).
- **Idempotency:** header `Idempotency-Key: <uuid>`. A retry returns the first result
  (`Idempotent-Replayed: true`); same key + different body = 409 `idempotency_key_reused`; creates use a
  record id derived from the key, so duplicates are impossible even after a restart. Creates without a key
  get a 10-minute duplicate guard. Updates are "set" operations: repeating one changes nothing.
- **Limits:** `BOT_WRITE_RATE_LIMIT_PER_MINUTE=10`, `BOT_WRITE_DAILY_LIMIT=200` per key.
- **Audit:** `bot_audit_log.params._write` = action, body summary (strings cut to 120 chars), changes,
  dry_run, Idempotency-Key, result id.
- **Response:** `{data: {...}, write: {action, actor, dry_run, changed, changes, warnings, result_id, replayed}}`;
  201 for a new note / task, else 200. Rule refusals are 409 with a specific `code`.

## Keys
```
python scripts/bot_keys.py create --name grok --scopes default --expires-days 180   # prints key once + SQL
python scripts/bot_keys.py grant   --name grok --scopes notes:write,tasks:write      # add write scopes (SQL)
python scripts/bot_keys.py ungrant --name grok --scopes all-write                    # take them away (SQL)
python scripts/bot_keys.py revoke --name grok                                        # prints SQL
python scripts/bot_keys.py list --apply                                              # needs SUPABASE_URL/KEY
```
Scope changes keep the same key and apply within ~60s. Add `--apply` to run directly.

## Quick test
```
curl -H "Authorization: Bearer $KEY" https://<host>/api/bot/v1/whoami
curl -H "Authorization: Bearer $KEY" "https://<host>/api/bot/v1/guide?format=markdown"
curl -X POST -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
     -d '{"content":"test"}' "https://<host>/api/bot/v1/leads/<lead id>/notes?dry_run=true"
```

## Later (not built)
Optional thin adapters on top of this API - e.g. an MCP server or a Telegram bot - each using its own
bot key. They add convenience only; the API stays the single source.
