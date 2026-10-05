# Human escalation (improvement #5)

Code: `app/services/logic.py` (`_escalate_customer_message`, `_escalate`, `handle_service_selection`,
`handle_guests_input`). Tests: `tests/test_escalation.py`. No schema change.

## Switches (DigitalOcean env, component `haydebot`)
| Variable | Default | Effect |
|---|---|---|
| `ESCALATION_ENABLED` | `false` | Turns everything below on. `false` = old bot behaviour. |
| `ESCALATION_ALERT_COOLDOWN_MINUTES` | `60` | At most one alert per lead and kind in this window (`0` = no limit). |
| `ESCALATION_CUSTOMER_ACK` | `false` | Also send the customer `ESCALATION_ACK_TEXT` (max once per lead per 12h). Needs `ESCALATION_ENABLED`. |

## Behaviour with `ESCALATION_ENABLED=true`
- **After the intake** (state `COMPLETED`, or a lead whose status is no longer `New`) the bot does not
  answer by itself anymore: no repeated "פרטי האירוע נשמרו!", no menu, no intake questions. Partners get
  the approved template `admin_system_alert_v2`:
  - `💬 לקוח ממתין למענה`: the customer wrote after the intake;
  - `🙋 לקוח מבקש נציג`: an explicit request ("לדבר עם מישהו" in the menu, "???", or words like
    נציג / דחוף / אף אחד / מחכה / urgent / human); also sent by email.
  Each alert also writes an activity row (`לקוח ממתין למענה` / `בקשת נציג`, actor `מערכת`), shown on the
  History page and used for the cooldown. `Last_Interaction` is updated; a lead still in `Processing`
  moves to `New`.
- **"לדבר עם מישהו"** in the menu: status `New` (not `Manual`), conversation `COMPLETED`, the existing
  reply "אין בעיה! כבר מעביר…", and the `🙋` alert instead of the generic `admin_new_lead` alert.
- **End of the intake**: status `New` instead of `Processing` ("בטיפול בוט"). The "new lead" alert
  (`admin_new_lead` + email) is unchanged; the bouzouki check accepts `New` as before.
- **Unchanged**: everything during the intake (a greeting re-asks the current question, a menu word
  restarts the intake), muted chats (the "הודעה חדשה בצאט ידני" alert), returning Closed/Completed
  customers, musician buttons.

## Always (regardless of the flag)
"לדבר עם מישהו" no longer stores `Service = Talk` (the dashboard shows `Talk` as "הרצאה", a real
service). With the flag off the generic alert shows the service as "לדבר עם נציג".

## Alerts go to
Every number in `NOTIFICATION_NUMBERS` (as all existing admin alerts); the lead's owner is named in the
text. Per-owner routing belongs to improvements #4/#6.
