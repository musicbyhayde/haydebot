#!/usr/bin/env python3
"""Backfill Lead_Source (improvement #2) for existing leads from their first inbound messages.

Read-only by default: prints a dry-run report (counts only, no names or phones).

  # offline, from a JSON export (list of leads, see --help of --input):
  python scripts/backfill_lead_source.py --input leads_export.json
  # live, read-only through the app's Supabase client (.env / env vars):
  python scripts/backfill_lead_source.py
  # write guarded SQL to review / run in the Supabase SQL editor (contains PII: keep it out of git):
  python scripts/backfill_lead_source.py --input leads_export.json --sql /secure/place/backfill.sql
  # apply directly (live only, asks for confirmation unless --yes):
  python scripts/backfill_lead_source.py --apply

Rules (same detection as the live bot, app/services/lead_source.py):
- a lead that already has Lead_Source is never touched (and every UPDATE is guarded by
  "Lead_Source" is null, so re-running is safe);
- explicit signal in the first inbound message, or in a later one within 48h of it
  (meta_form / website; a referral object was never stored before this change);
- otherwise, same phone had an earlier lead -> that lead's original source (or "repeat");
- otherwise whatsapp_direct, but only for leads the bot created from that message (first inbound
  within 30 minutes of the lead's creation);
- leads created by hand in the dashboard (activity "יצירת ליד") or without any inbound message
  stay NULL unless an explicit signal is found: their real source is unknown.
- names are not changed by the backfill.

--input JSON: a list of {id, created_at, Phone, Lead_Source?, manual_created?, inbound: [{content, ts}]}
(inbound sorted oldest first; the first 3 are enough).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services import lead_source as L  # noqa: E402  (stdlib-only module)

DIRECT_MAX_GAP = timedelta(minutes=30)
WRITE_COLUMNS = [c for c in L.SOURCE_COLUMNS]


def _ts(raw):
    if not raw:
        return None
    s = str(raw).replace("Z", "+00:00")
    if s.endswith("+00"):
        s += ":00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ─── loading ──────────────────────────────────────────────────────────────────────────
def load_input(path: str) -> list:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "leads" in data:
        data = data["leads"]
    return data


def load_live(max_inbound: int = 3) -> list:  # pragma: no cover - needs a database
    from app.services.supabase_service import supabase_service as db
    if not db.client:
        raise SystemExit("No Supabase client (check SUPABASE_URL / key env vars).")
    leads = db._select_all(lambda: db.client.table("leads").select("*").order("created_at").order("id"))
    msgs = db._select_all(lambda: db.client.table("messages").select('"Lead","Content","Timestamp"')
                          .eq("Direction", "Inbound").order("Timestamp").order("id"))
    acts = db._select_all(lambda: db.client.table("activities").select("lead_id")
                          .eq("action_type", "יצירת ליד").order("id"))
    manual = {a.get("lead_id") for a in acts if a.get("lead_id")}
    by_lead: dict = {}
    for m in msgs:
        for lid in m.get("Lead") or []:
            lst = by_lead.setdefault(lid, [])
            if len(lst) < max_inbound:
                lst.append({"content": m.get("Content"), "ts": m.get("Timestamp")})
    out = []
    for r in leads:
        row = {k: r.get(k) for k in ("id", "created_at", "Phone", "Status") + tuple(L.SOURCE_COLUMNS)}
        row["manual_created"] = r.get("id") in manual
        row["inbound"] = by_lead.get(r.get("id"), [])
        out.append(row)
    return out


# ─── planning ─────────────────────────────────────────────────────────────────────────
def plan(leads: list, now: datetime | None = None) -> tuple[list, Counter, dict]:
    """Return (updates [(lead_id, columns)], reason counter, extra stats). Pure function."""
    now = now or datetime.now(timezone.utc)
    rows = sorted(leads, key=lambda r: (_ts(r.get("created_at")) or datetime.max.replace(tzinfo=timezone.utc), r.get("id") or ""))
    assigned: dict = {}   # lead id -> source columns (existing or planned), for repeat inheritance
    seen: list = []       # earlier leads [{id, created_at, Phone, fields}]
    updates, reasons = [], Counter()
    extra = {"by_source": Counter(), "event_type": Counter(), "form_language": Counter(),
             "website_topic": Counter(), "form_phone_differs": 0, "explicit_in_followup": 0}
    for r in rows:
        lid = r.get("id")
        phone = r.get("Phone")
        prev = [p for p in seen if L.phones_match(p["Phone"], phone)]
        seen.append({"id": lid, "createdTime": r.get("created_at"), "Phone": phone,
                     "fields": assigned.setdefault(lid, {})})
        if r.get("Lead_Source"):
            assigned[lid].update({c: r.get(c) for c in L.INHERITED_COLUMNS if r.get(c)})
            reasons["skip_already_set"] += 1
            continue
        inbound = [m for m in (r.get("inbound") or []) if m]
        cols: dict = {}
        if inbound:
            first_ts = _ts(inbound[0].get("ts"))
            cols = L.detect_explicit(inbound[0].get("content"), None, phone)
            if not cols:
                for m in inbound[1:]:
                    mt = _ts(m.get("ts"))
                    if first_ts and mt and mt - first_ts > L.UPGRADE_WINDOW:
                        break
                    cols = L.detect_explicit(m.get("content"), None, phone)
                    if cols:
                        extra["explicit_in_followup"] += 1
                        break
        reason = None
        if cols.get("Lead_Source") in L.EXPLICIT_SOURCES:
            reason = "explicit_" + cols["Lead_Source"]
        else:
            created = _ts(r.get("created_at"))
            first_ts = _ts(inbound[0].get("ts")) if inbound else None
            bot_created = (not r.get("manual_created") and created and first_ts
                           and abs(first_ts - created) <= DIRECT_MAX_GAP)
            rep = L.inherit_from_previous(prev, exclude_id=lid) if prev else {}
            if rep and (bot_created or rep.get("Lead_Source") != "repeat"):
                cols = rep
                reason = "repeat_inherited" if rep["Lead_Source"] != "repeat" else "repeat_unknown_origin"
            elif bot_created:
                cols = {"Lead_Source": "whatsapp_direct", "Source_Detail": L.AUTO_DIRECT_DETAIL}
                reason = "whatsapp_direct"
            else:
                reasons["leave_null_manual" if r.get("manual_created") else
                        ("leave_null_no_inbound" if not inbound else "leave_null_not_bot_created")] += 1
                continue
        cols["Source_Detected_At"] = now.isoformat()
        assigned[lid].update({c: cols.get(c) for c in L.INHERITED_COLUMNS if cols.get(c)})
        updates.append((lid, cols))
        reasons[reason] += 1
        extra["by_source"][cols["Lead_Source"]] += 1
        if reason.startswith("repeat"):
            continue
        fa = cols.get("Form_Answers") or {}
        if cols["Lead_Source"] == "meta_form":
            extra["event_type"][fa.get("event_type") if fa.get("event_type") in
                                ("חתונה", "בר מצווה", "בת מצווה", "יום הולדת", "אירוע חברה", "אחר") else
                                ("(free text)" if fa.get("event_type") else "(none)")] += 1
            extra["form_language"][fa.get("language") or "(no opener)"] += 1
            if fa.get("phone_matches_whatsapp") is False:
                extra["form_phone_differs"] += 1
        if cols["Lead_Source"] == "website":
            extra["website_topic"][cols.get("Source_Detail") or "(general)"] += 1
    return updates, reasons, extra


# ─── output ───────────────────────────────────────────────────────────────────────────
def report(leads: list, updates: list, reasons: Counter, extra: dict) -> str:
    lines = ["Lead source backfill - DRY RUN (nothing written)", f"leads: {len(leads)}",
             f"to update: {len(updates)}", "", "by reason:"]
    lines += [f"  {k}: {v}" for k, v in sorted(reasons.items(), key=lambda x: -x[1])]
    lines += ["", "planned Lead_Source:"]
    lines += [f"  {k} ({L.LEAD_SOURCE_HE.get(k)}): {v}" for k, v in extra["by_source"].most_common()]
    lines += ["", "explicit meta_form leads - event type:"] + [f"  {k}: {v}" for k, v in extra["event_type"].most_common()]
    lines += ["meta_form language:"] + [f"  {k}: {v}" for k, v in extra["form_language"].most_common()]
    lines += [f"meta_form phone differs from WhatsApp number: {extra['form_phone_differs']}"]
    lines += ["website topic:"] + [f"  {k}: {v}" for k, v in extra["website_topic"].most_common()]
    lines += [f"explicit signal found in a follow-up message (not the first): {extra['explicit_in_followup']}"]
    return "\n".join(lines)


def sql_literal(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, (dict, list)):
        return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def to_sql(updates: list) -> str:
    out = ["-- Lead source backfill (improvement #2). Generated by scripts/backfill_lead_source.py",
           "-- Run AFTER migrations/add_lead_source_columns.sql. Contains customer data: do not commit.",
           "-- Every statement only touches rows whose Lead_Source is still null (safe to re-run).",
           "begin;"]
    for lid, cols in updates:
        sets = ", ".join(f'"{c}" = {sql_literal(cols[c])}' + ("::timestamptz" if c == "Source_Detected_At" else "")
                         for c in WRITE_COLUMNS if c in cols and cols[c] is not None)
        out.append(f'update public.leads set {sets} where id = {sql_literal(lid)} and "Lead_Source" is null;')
    out += ["commit;", "",
            '-- check: select "Lead_Source", count(*) from public.leads group by 1 order by 2 desc;']
    return "\n".join(out) + "\n"


def apply_live(updates: list) -> int:  # pragma: no cover - needs a database
    from app.services.supabase_service import supabase_service as db
    done = 0
    for lid, cols in updates:
        payload = {c: cols[c] for c in WRITE_COLUMNS if c in cols and cols[c] is not None}
        res = db.client.table("leads").update(payload).eq("id", lid).is_("Lead_Source", "null").execute()
        done += 1 if res.data else 0
    return done


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="JSON export instead of the live database")
    ap.add_argument("--sql", help="write guarded UPDATE statements to this file (contains PII)")
    ap.add_argument("--apply", action="store_true", help="write to the live database")
    ap.add_argument("--yes", action="store_true", help="do not ask for confirmation with --apply")
    args = ap.parse_args(argv)
    if args.apply and args.input:
        ap.error("--apply works on the live database only (no --input)")
    leads = load_input(args.input) if args.input else load_live()
    updates, reasons, extra = plan(leads)
    print(report(leads, updates, reasons, extra))
    if args.sql:
        with open(args.sql, "w", encoding="utf-8") as fh:
            fh.write(to_sql(updates))
        try:
            os.chmod(args.sql, 0o600)
        except OSError:
            pass
        print(f"\nSQL written: {args.sql} ({len(updates)} updates)")
    if args.apply:
        if not args.yes and input(f"Write {len(updates)} lead updates? type yes: ").strip() != "yes":
            print("aborted")
            return 1
        print(f"updated: {apply_live(updates)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
