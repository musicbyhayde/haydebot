"""Shared helpers for Bot API tests: fake key table + captured audit rows."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.bot import audit, keys
from app.bot.keyformat import generate_key
from app.bot.ratelimit import limiter
from app.core.config import get_settings


class KeyTable:
    def __init__(self):
        self.rows: list[dict] = []
        self.fail: Exception | None = None
        self.reads = 0

    def add(self, name, scopes, active=True, expires_at=None, rate_limit=None):
        key, prefix, h = generate_key()
        self.rows.append({"id": f"id-{name}", "name": name, "key_hash": h, "key_prefix": prefix,
                          "scopes": list(scopes), "active": active,
                          "expires_at": expires_at, "rate_limit_per_min": rate_limit})
        return key

    def fetch(self):
        self.reads += 1
        if self.fail:
            raise self.fail
        return [dict(r) for r in self.rows]


@pytest.fixture
def bot_env(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "BOT_API_ENABLED", True)
    monkeypatch.setattr(s, "BOT_DOCS_PUBLIC", False)
    monkeypatch.setattr(s, "BOT_RATE_LIMIT_PER_MINUTE", 60)
    monkeypatch.setattr(s, "BOT_ANON_RATE_LIMIT_PER_MINUTE", 20)
    table = KeyTable()
    rows: list[dict] = []
    touched: list[str] = []
    monkeypatch.setattr(keys, "_fetch_rows", table.fetch)
    monkeypatch.setattr(keys, "_write_last_used", lambda key_id: touched.append(key_id))
    monkeypatch.setattr(audit, "_insert", lambda row: rows.append(row))
    keys.invalidate_cache()
    limiter.reset()

    class Env:
        pass
    env = Env()
    env.settings, env.table, env.audit_rows, env.touched = s, table, rows, touched

    def audited():
        audit.flush()
        return rows
    env.audited = audited
    yield env
    audit.flush()
    keys.invalidate_cache()
    limiter.reset()


def hdr(key):
    return {"Authorization": f"Bearer {key}"}


def past(days=1):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def future(days=1):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
