# Lead source / attribution (improvement #2)

Code: `app/services/lead_source.py` (detection, stdlib only), wiring in `app/services/logic.py`
(`_process_single_message`, `_apply_new_lead_source`, `_refine_lead_source`), manual source in
`app/api/routes.py` (`POST /leads`, `PATCH /leads/{id}`), Bot API in `app/bot/data.py`.
Dashboard: `LeadSourceBadge`, `LeadSourceSection`, `LeadsDashboard` (column + filter), `AddLeadModal`
(required source). Tests: `tests/test_lead_source.py`, `tests/test_lead_source_api_backfill.py`,
`frontend/__tests__/LeadSource.test.tsx`. No env switch.

## Schema (`migrations/add_lead_source_columns.sql`, rollback `rollback_add_lead_source_columns.sql`)
All nullable, no defaults: `Lead_Source`, `Source_Detail`, `Campaign_ID/Name`, `Adset_ID/Name`,
`Ad_ID/Name`, `Form_ID/Name`, `UTM_Source/Medium/Campaign/Content`, `CTWA_CLID`, `Meta_Lead_ID`
(text); `Source_Referral`, `Form_Answers` (jsonb); `Source_Detected_At` (timestamptz).
CHECK on the `Lead_Source` values, index on `Lead_Source`, partial unique index on `Meta_Lead_ID`.
**Run the SQL before deploying the code.** Without the columns the code keeps working (every source
write is a separate update that is caught and logged as `ERROR update_lead`), but nothing is stored.

## Values
| `Lead_Source` | Hebrew | Set by |
|---|---|---|
| `meta_form` | טופס מטא | first message is Meta's lead-form auto text (he/en/fr/ar) |
| `ctwa` | מודעת וואטסאפ | message carries a WhatsApp `referral` (click-to-WhatsApp ad/post) |
| `website` | אתר | website button text ("…מגיע אליכם דרך האתר שלכם…") or a `[web:<code>]` tag |
| `whatsapp_direct` | וואטסאפ ישיר | first message with no signal (`Source_Detail` = `זוהה אוטומטית`) |
| `repeat` | לקוח חוזר | same phone had an earlier lead whose source is unknown |
| `referral` / `phone` / `other` | המלצה / טלפון / אחר | by hand (manual lead, lead card) |

## Detection (new lead, first inbound message)
Precedence: referral > Meta form > website > repeat customer > whatsapp_direct.
- **Meta form**: opener `הי! השלמתי את הטופס שלך…` / `Hello! I filled out|in your form…` /
  `Bonjour ! J'ai rempli votre formulaire…` / `مرحبًا! لقد قمتُ بملء النموذج…` (diacritics, NBSP and
  bidi marks are stripped), or at least two form lines without the opener. Lines `Full name` /
  `full_name`, `Phone number` / `phone_number`, `מה סוג האירוע שלכם?` / `מה_סוג_האירוע_שלכם?` in any
  order go to `Form_Answers` (`language`, `full_name`, `phone`, `event_type`, `answers`, `note`,
  `phone_matches_whatsapp`). `Source_Detail` = event type. The form's full name replaces the lead
  name only when WhatsApp sent none (`Unknown`).
- **Referral**: the raw object is stored in `Source_Referral` and logged as `REFERRAL_RECEIVED`;
  `CTWA_CLID` = `ctwa_clid`, `Ad_ID` = `source_id` (for `source_type=ad`), `Source_Detail` = headline,
  UTM values from `source_url`. Meta does not send campaign/adset names in the referral.
- **Website**: `Source_Detail` = the topic after "לגבי"/"על" (e.g. נגן בוזוקי); `[web:summer26]`
  -> `UTM_Campaign=summer26`, `UTM_Source=website`; `utm_*=` pairs in the text are parsed too.
- **Repeat customer** (earlier lead with the same last 9 digits, e.g. a Lost/Cold lead): the oldest
  earlier lead's source and campaign/ad/form/UTM columns are copied (not `CTWA_CLID`/`Meta_Lead_ID`),
  `Source_Detail` = `לקוח חוזר · ליד קודם <id>`. An explicit signal in the new message wins.
- A returning **Closed/Completed** customer is logged on the old lead: its source is not changed
  (only an empty `Source_Referral` is filled).

## Later messages
Never overwrites a source set by hand or by an explicit signal. An automatic guess
(`whatsapp_direct`/`זוהה אוטומטית` or an inherited repeat) is upgraded when a form/website/referral
message arrives within 48h of the lead's creation (customers sometimes type a word first; 3 such leads
in the data). A referral is always kept in `Source_Referral` if that column is still empty.
Dashboard edits set `Source_Detail` = `עודכן ידנית` (manual lead: `ליד ידני`).

## Bot API
`lead_source`, `lead_source_he` in every lead; detail has `source{value, detail, campaign_*, adset_*,
ad_*, form_*, utm_*, detected_at, referral{source_type, source_id, source_url, headline, body,
media_type}, form{language, event_type, answers, phone_matches_whatsapp}}`; the form's name/phone and
`ctwa_clid`/`meta_lead_id` only with `pii:read` (otherwise `phone_masked`). `GET /leads?source=meta_form,ctwa`
(`none` = unknown). `GET /stats` -> `by_source`. The guide lists the values.

## Backfill (`scripts/backfill_lead_source.py`)
Read-only dry run by default (counts only, no names/phones). `--input export.json` works offline;
without it the app's Supabase client is used (read-only). `--sql file` writes guarded UPDATEs
(`where id=… and "Lead_Source" is null`, one transaction, contains PII: keep out of git). `--apply`
writes live after a confirmation. Rules: explicit signal in the first inbound message (or within 48h
in the next two); else repeat inheritance; else `whatsapp_direct` only for leads the bot created from
that message (first inbound within 30 min of creation). Manual leads (activity `יצירת ליד`) and leads
without inbound messages stay NULL unless a signal is found. Names are not changed.

## Deploy order
1. Run `migrations/add_lead_source_columns.sql` (Supabase SQL editor). Check the columns.
2. Deploy backend (DO) and frontend (Vercel) from the branch/main.
3. Dry run the backfill, review, then run the generated SQL (or `--apply`).
Rollback: code back to the previous main, then (optional, loses source data)
`migrations/rollback_add_lead_source_columns.sql`.
