#!/usr/bin/env python3
"""Create / revoke / list Bot API keys (public.bot_api_keys).

  python scripts/bot_keys.py scopes
  python scripts/bot_keys.py create --name grok [--scopes default] [--expires-days 180] [--rate-limit 60]
  python scripts/bot_keys.py grant   --name grok --scopes notes:write,tasks:write   (add scopes to a key)
  python scripts/bot_keys.py ungrant --name grok --scopes all-write                 (remove scopes)
  python scripts/bot_keys.py revoke --name grok
  python scripts/bot_keys.py list --apply

Scopes: comma list of scopes and/or presets (default, all-read, all-write), e.g.
'default,notes:write'. Write scopes only take effect while the server has BOT_API_WRITE_ENABLED=true.
Scope changes apply within ~60s (key cache); the key itself stays the same.

By default nothing touches the database: `create` prints the new key ONCE plus an INSERT
statement that contains only the key's SHA-256 hash; `revoke` prints an UPDATE. Run that SQL
yourself (Supabase SQL editor / management API). With --apply the script runs it directly using
SUPABASE_URL + SUPABASE_KEY (service key) from the environment or ./.env.

The plaintext key is printed only here, to your terminal. It is not stored or logged anywhere;
if it is lost, create a new key and revoke the old one.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from app.bot.keyformat import generate_key  # noqa: E402  (pure module, no settings)
from app.bot.scopes import (DEFAULT_SCOPES, PRESETS, READ_SCOPES, RESERVED_SCOPES, SCOPES,  # noqa: E402
                            WRITE_SCOPES, parse_scope_arg)

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{1,48}$")


def _sql_text_array(items: list[str]) -> str:
    return "array[" + ", ".join("'" + i + "'" for i in items) + "]::text[]"


def _client():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not (url and key) and os.path.exists(".env"):
        for line in open(".env", encoding="utf-8"):
            m = re.match(r"^\s*(SUPABASE_URL|SUPABASE_KEY)\s*=\s*['\"]?([^'\"\n]+)", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip())
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not (url and key):
        sys.exit("SUPABASE_URL / SUPABASE_KEY not set (needed for --apply)")
    from supabase import create_client
    return create_client(url, key)


def _warn_writes(scopes: list[str]) -> None:
    w = [s for s in scopes if s in WRITE_SCOPES]
    if w:
        print(f"NOTE: write scopes {', '.join(w)} - the bot can change data (only while the server has "
              "BOT_API_WRITE_ENABLED=true).", file=sys.stderr)


def cmd_scopes(_args) -> None:
    print("Read scopes:")
    for s, d in READ_SCOPES.items():
        print(f"  {s:16} {d}")
    print("Write scopes (need BOT_API_WRITE_ENABLED=true on the server):")
    for s, d in WRITE_SCOPES.items():
        print(f"  {s:16} {d}")
    if RESERVED_SCOPES:
        print("Planned (not available yet):")
        for s, d in RESERVED_SCOPES.items():
            print(f"  {s:16} {d}")
    print("Presets: " + "; ".join(f"{p} = {','.join(v)}" for p, v in PRESETS.items()))


def cmd_create(args) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("name: lowercase letters/digits/._- , 2-49 chars (e.g. grok, n8n-reports)")
    try:
        scopes = parse_scope_arg(args.scopes)
    except ValueError as e:
        sys.exit(f"scopes: {e}")
    if args.rate_limit is not None and not 1 <= args.rate_limit <= 600:
        sys.exit("rate-limit must be 1..600")
    expires = (datetime.now(timezone.utc) + timedelta(days=args.expires_days)) if args.expires_days else None
    _warn_writes(scopes)
    key, prefix, key_hash = generate_key()

    if args.apply:
        row = {"name": args.name, "key_hash": key_hash, "key_prefix": prefix, "scopes": scopes,
               "expires_at": expires.isoformat() if expires else None,
               "rate_limit_per_min": args.rate_limit, "notes": args.notes}
        try:
            _client().table("bot_api_keys").insert(row).execute()
        except Exception as e:  # do not print the key if it was not stored
            sys.exit(f"insert failed: {type(e).__name__} (name already used?)")
        print(f"Stored key '{args.name}' ({prefix}) with scopes: {', '.join(scopes)}")
    else:
        cols = "name, key_hash, key_prefix, scopes"
        vals = f"'{args.name}', '{key_hash}', '{prefix}', {_sql_text_array(scopes)}"
        if expires:
            cols += ", expires_at"
            vals += f", '{expires.isoformat()}'"
        if args.rate_limit is not None:
            cols += ", rate_limit_per_min"
            vals += f", {int(args.rate_limit)}"
        print("-- Run this SQL (contains only the hash, safe to keep):")
        print(f"insert into public.bot_api_keys ({cols}) values ({vals});")
        print()

    if not sys.stdout.isatty():
        print("WARNING: output is not a terminal - the key below ends up wherever stdout goes.",
              file=sys.stderr)
    print("=" * 72)
    print("BOT KEY (shown once, store it in the bot's secret settings):")
    print(key)
    print("=" * 72)
    print(f"Use: Authorization: Bearer <key>   Expires: {expires.date() if expires else 'never'}")


def cmd_revoke(args) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("bad name")
    if args.apply:
        res = _client().table("bot_api_keys").update({"active": False}).eq("name", args.name).execute()
        print(f"revoked {len(res.data or [])} key(s) named '{args.name}' (effective within ~60s)")
    else:
        print(f"update public.bot_api_keys set active = false where name = '{args.name}';")


def _grant(args, add: bool) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("bad name")
    try:
        scopes = parse_scope_arg(args.scopes)
    except ValueError as e:
        sys.exit(f"scopes: {e}")
    if add:
        _warn_writes(scopes)
    arr = _sql_text_array(scopes)
    if args.apply:
        cli = _client()
        rows = cli.table("bot_api_keys").select("scopes").eq("name", args.name).execute().data or []
        if not rows:
            sys.exit(f"no key named '{args.name}'")
        cur = list(rows[0].get("scopes") or [])
        new = sorted(set(cur) | set(scopes)) if add else [s for s in cur if s not in scopes]
        cli.table("bot_api_keys").update({"scopes": new}).eq("name", args.name).execute()
        print(f"'{args.name}' scopes: {', '.join(new) or '(none)'} (effective within ~60s)")
    elif add:
        print(f"update public.bot_api_keys set scopes = (select array_agg(distinct s order by s) "
              f"from unnest(scopes || {arr}) as s) where name = '{args.name}';")
    else:
        print(f"update public.bot_api_keys set scopes = array(select s from unnest(scopes) as s "
              f"where s <> all({arr})) where name = '{args.name}';")


def cmd_grant(args) -> None:
    _grant(args, add=True)


def cmd_ungrant(args) -> None:
    _grant(args, add=False)


def cmd_list(args) -> None:
    if not args.apply:
        print("select name, key_prefix, scopes, active, expires_at, last_used_at, created_at "
              "from public.bot_api_keys order by name;")
        return
    rows = (_client().table("bot_api_keys")
            .select("name, key_prefix, scopes, active, expires_at, last_used_at").order("name").execute().data)
    for r in rows or []:
        print(f"{r['name']:20} {r['key_prefix']:14} active={r['active']!s:5} "
              f"expires={r.get('expires_at') or '-'} last_used={r.get('last_used_at') or '-'} "
              f"scopes={','.join(r.get('scopes') or [])}")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Manage HaydeBot Bot API keys")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scopes").set_defaults(fn=cmd_scopes)
    c = sub.add_parser("create")
    c.add_argument("--name", required=True)
    c.add_argument("--scopes", default="default",
                   help=f"preset ({', '.join(PRESETS)}) or comma list; default = {','.join(DEFAULT_SCOPES)}")
    c.add_argument("--expires-days", type=int, default=180, help="0 = never (default 180)")
    c.add_argument("--rate-limit", type=int, default=None, help="requests/minute for this key")
    c.add_argument("--notes", default=None)
    c.add_argument("--apply", action="store_true", help="insert directly (needs SUPABASE_URL/KEY)")
    c.set_defaults(fn=cmd_create)
    for name, fn in (("grant", cmd_grant), ("ungrant", cmd_ungrant)):
        g = sub.add_parser(name, help=f"{'add' if fn is cmd_grant else 'remove'} scopes on an existing key")
        g.add_argument("--name", required=True)
        g.add_argument("--scopes", required=True, help="comma list of scopes / presets")
        g.add_argument("--apply", action="store_true")
        g.set_defaults(fn=fn)
    r = sub.add_parser("revoke")
    r.add_argument("--name", required=True)
    r.add_argument("--apply", action="store_true")
    r.set_defaults(fn=cmd_revoke)
    ls = sub.add_parser("list")
    ls.add_argument("--apply", action="store_true")
    ls.set_defaults(fn=cmd_list)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
