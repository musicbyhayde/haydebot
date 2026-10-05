"""Admin screen "משתמשים" (viewer accounts): Supabase Admin API + dashboard_users, admin only,
viewer rows only, immediate revocation, audit rows. Supabase is faked in memory."""
import time
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import auth, dashboard_users as du
from app.core.config import get_settings
from app.services import user_admin

SECRET = "unit-test-jwt-secret-unit-test-jwt-secret"
ADMIN, ADMIN2, PARTNER = "admin@example.com", "admin2@example.com", "partner@example.com"
PW = "Str0ng-pass-123"


class _Query:
    def __init__(self, db, op, payload=None):
        self.db, self.op, self.payload, self.filters = db, op, payload, []

    def select(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def _match(self, r):
        return all(r.get(c) == v for c, v in self.filters)

    def execute(self):
        rows = self.db.rows
        if self.db.fail_insert and self.op == "insert":
            raise RuntimeError("insert failed")
        if self.op == "select":
            return SimpleNamespace(data=deepcopy([r for r in rows if self._match(r)]))
        if self.op == "insert":
            rows.append({"created_at": "2026-10-05T10:00:00Z", **self.payload})
            return SimpleNamespace(data=[self.payload])
        if self.op == "update":
            for r in rows:
                if self._match(r):
                    r.update(self.payload)
            return SimpleNamespace(data=[])
        if self.op == "delete":
            self.db.rows[:] = [r for r in rows if not self._match(r)]
            return SimpleNamespace(data=[])


class _Table:
    def __init__(self, db): self.db = db
    def select(self, *a, **k): return _Query(self.db, "select")
    def insert(self, payload): return _Query(self.db, "insert", payload)
    def update(self, payload): return _Query(self.db, "update", payload)
    def delete(self): return _Query(self.db, "delete")


class _Admin:
    def __init__(self, db): self.db = db

    def create_user(self, attrs):
        if any(u.email == attrs["email"] for u in self.db.auth):
            raise RuntimeError("A user with this email address has already been registered")
        u = SimpleNamespace(id=f"uid-{len(self.db.auth) + 1}", email=attrs["email"], banned_until=None,
                            last_sign_in_at=None, password=attrs["password"])
        self.db.auth.append(u)
        return SimpleNamespace(user=u)

    def list_users(self, page=None, per_page=None):
        return list(self.db.auth) if (page or 1) == 1 else []

    def update_user_by_id(self, uid, attrs):
        u = next(u for u in self.db.auth if u.id == uid)
        if self.db.fail_ban and attrs.get("ban_duration") not in (None, "none"):
            raise RuntimeError("ban failed")
        if "ban_duration" in attrs:
            u.banned_until = None if attrs["ban_duration"] == "none" else "2126-01-01"
        if "password" in attrs:
            u.password = attrs["password"]
        self.db.calls.append(("update", uid, sorted(attrs)))
        return SimpleNamespace(user=u)

    def delete_user(self, uid, should_soft_delete=False):
        self.db.auth[:] = [u for u in self.db.auth if u.id != uid]


class FakeSupabase:
    def __init__(self):
        self.rows = [
            {"email": ADMIN, "role": "admin", "display_name": "אילן", "active": True, "created_at": "1"},
            {"email": ADMIN2, "role": "admin", "display_name": "מנהל", "active": True, "created_at": "2"},
            {"email": PARTNER, "role": "partner", "display_name": "קובי", "active": True, "created_at": "3"},
        ]
        self.auth = [SimpleNamespace(id=f"uid-a{i}", email=e, banned_until=None, last_sign_in_at="2026-10-01",
                                     password="x") for i, e in enumerate((ADMIN, ADMIN2, PARTNER))]
        self.fail_insert = self.fail_ban = False
        self.calls = []
        self.auth_api = SimpleNamespace(admin=_Admin(self))

    @property
    def auth_admin(self): return self.auth_api.admin

    def table(self, name):
        assert name == "dashboard_users"
        return _Table(self)


@pytest.fixture
def fake(monkeypatch, mock_service):
    db = FakeSupabase()
    client_obj = SimpleNamespace(table=db.table, auth=db.auth_api)
    monkeypatch.setattr(user_admin, "_client", lambda: client_obj)
    monkeypatch.setattr(du, "_fetch_rows", lambda: deepcopy(db.rows))
    s = get_settings()
    monkeypatch.setattr(s, "SUPABASE_JWT_SECRET", SECRET)
    auth._cache.clear()
    du.invalidate_cache()
    with patch("app.api.routes.airtable_service", mock_service), patch("app.core.scheduler.scheduler"):
        from app.main import app
        db.http = TestClient(app, raise_server_exceptions=False)
        yield db
    auth._cache.clear()
    du.invalidate_cache()


def H(email):
    tok = jwt.encode({"sub": "u", "email": email, "aud": "authenticated", "exp": int(time.time()) + 3600},
                     SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


def _create(db, email="roni@example.com", name="רוני (יועץ)", pw=PW, who=ADMIN2):
    return db.http.post("/api/v1/admin/users", headers=H(who),
                        json={"email": email, "password": pw, "display_name": name})


# ── access ──────────────────────────────────────────────

def test_only_admin_jwt(fake, monkeypatch):
    assert fake.http.get("/api/v1/admin/users", headers=H(PARTNER)).status_code == 403
    assert fake.http.get("/api/v1/admin/users").status_code == 403
    key = "server-to-server-key-0123456789abcdef"
    monkeypatch.setattr(get_settings(), "API_KEY", key)
    assert fake.http.get("/api/v1/admin/users", headers={"X-API-Key": key}).status_code == 403
    for who in (ADMIN, ADMIN2):
        r = fake.http.get("/api/v1/admin/users", headers=H(who))
        assert r.status_code == 200
        assert {u["email"] for u in r.json()} == {ADMIN, ADMIN2, PARTNER}
        assert not any(u["manageable"] for u in r.json())   # v1: only viewers are manageable


# ── create ──────────────────────────────────────────────

def test_create_viewer_end_to_end(fake, audit_rows):
    r = _create(fake)
    assert r.status_code == 201, r.text
    assert r.json() == {"email": "roni@example.com", "role": "viewer", "display_name": "רוני (יועץ)", "active": True}
    assert any(u.email == "roni@example.com" for u in fake.auth)
    assert fake.rows[-1]["role"] == "viewer"
    # usable at once, read-only
    assert fake.http.get("/api/v1/leads", headers=H("roni@example.com")).status_code == 200
    assert fake.http.post("/api/v1/leads/rec_x/notes", headers=H("roni@example.com"), json={}).status_code == 403
    assert fake.http.get("/api/v1/admin/users", headers=H("roni@example.com")).status_code == 403
    assert [a for a in audit_rows if a["event"] == "user_created"][0]["detail"]["target"] == "roni@example.com"
    lst = fake.http.get("/api/v1/admin/users", headers=H(ADMIN2)).json()
    assert [u["manageable"] for u in lst if u["email"] == "roni@example.com"] == [True]


@pytest.mark.parametrize("payload,status", [
    ({"email": "bad", "password": PW, "display_name": "רוני"}, 400),
    ({"email": "r@example.com", "password": "short", "display_name": "רוני"}, 400),
    ({"email": "r@example.com", "password": PW, "display_name": "אילן"}, 400),
    ({"email": "r@example.com", "password": PW, "display_name": "קובי"}, 400),
    ({"email": "r@example.com", "password": PW, "display_name": "מנהל"}, 400),
    ({"email": "r@example.com", "password": PW, "display_name": "bot:x"}, 400),
    ({"email": "r@example.com", "password": PW, "display_name": "ר"}, 400),
    ({"email": PARTNER, "password": PW, "display_name": "רוני"}, 409),
    ({"email": "r@example.com", "password": PW, "display_name": "רוני", "role": "admin"}, 400),
])
def test_create_validation(fake, payload, status):
    r = fake.http.post("/api/v1/admin/users", headers=H(ADMIN), json=payload)
    assert r.status_code == status, r.text
    assert len(fake.rows) == 3 and len(fake.auth) == 3


def test_duplicate_display_name_and_existing_auth_email(fake):
    assert _create(fake).status_code == 201
    assert _create(fake, email="other@example.com").status_code == 409            # same display name
    fake.auth.append(SimpleNamespace(id="uid-x", email="ghost@example.com", banned_until=None, last_sign_in_at=None))
    r = _create(fake, email="ghost@example.com", name="רוח")
    assert r.status_code == 409 and "רשומה" in r.json()["detail"]


def test_create_rolls_back_auth_user_when_row_insert_fails(fake):
    fake.fail_insert = True
    r = _create(fake)
    assert r.status_code == 502
    assert not any(u.email == "roni@example.com" for u in fake.auth)


# ── disable / enable / password / delete ────────────────

def test_disable_is_immediate_and_bans(fake, audit_rows):
    _create(fake)
    v = H("roni@example.com")
    assert fake.http.get("/api/v1/leads", headers=v).status_code == 200
    r = fake.http.post("/api/v1/admin/users/roni@example.com/disable", headers=H(ADMIN))
    assert r.status_code == 200 and r.json()["active"] is False
    assert fake.http.get("/api/v1/leads", headers=v).status_code == 403            # same token, next request
    u = next(u for u in fake.auth if u.email == "roni@example.com")
    assert u.banned_until
    r = fake.http.post("/api/v1/admin/users/roni@example.com/enable", headers=H(ADMIN))
    assert r.status_code == 200
    assert u.banned_until is None
    assert fake.http.get("/api/v1/leads", headers=v).status_code == 200
    events = [a["event"] for a in audit_rows if a["event"].startswith("user_")]
    assert events == ["user_created", "user_disabled", "user_enabled"]


def test_disable_still_revokes_when_ban_fails(fake):
    _create(fake)
    fake.fail_ban = True
    r = fake.http.post("/api/v1/admin/users/roni@example.com/disable", headers=H(ADMIN))
    assert r.status_code == 200 and "warning" in r.json()
    assert fake.http.get("/api/v1/leads", headers=H("roni@example.com")).status_code == 403


def test_reset_password(fake, audit_rows):
    _create(fake)
    assert fake.http.post("/api/v1/admin/users/roni@example.com/password", headers=H(ADMIN),
                          json={"password": "short"}).status_code == 400
    r = fake.http.post("/api/v1/admin/users/roni@example.com/password", headers=H(ADMIN),
                       json={"password": "N3w-password-456"})
    assert r.status_code == 200
    assert next(u for u in fake.auth if u.email == "roni@example.com").password == "N3w-password-456"
    assert any(a["event"] == "password_reset" for a in audit_rows)
    assert all("N3w-password-456" not in str(a) for a in audit_rows)              # never logged


def test_delete_viewer(fake):
    _create(fake)
    r = fake.http.delete("/api/v1/admin/users/roni@example.com", headers=H(ADMIN))
    assert r.status_code == 200
    assert not any(u.email == "roni@example.com" for u in fake.auth)
    assert not any(row["email"] == "roni@example.com" for row in fake.rows)
    assert fake.http.get("/api/v1/leads", headers=H("roni@example.com")).status_code == 403


@pytest.mark.parametrize("target", [PARTNER, ADMIN2, ADMIN])
def test_existing_users_cannot_be_changed(fake, target):
    before = deepcopy(fake.rows)
    for path in (f"/{target}/disable", f"/{target}/enable"):
        assert fake.http.post("/api/v1/admin/users" + path, headers=H(ADMIN)).status_code in (400, 403)
    assert fake.http.post(f"/api/v1/admin/users/{target}/password", headers=H(ADMIN),
                          json={"password": PW}).status_code in (400, 403)
    assert fake.http.delete(f"/api/v1/admin/users/{target}", headers=H(ADMIN)).status_code in (400, 403)
    assert fake.rows == before
    assert all(u.banned_until is None for u in fake.auth)


def test_unknown_user_404(fake):
    assert fake.http.post("/api/v1/admin/users/nobody@example.com/disable", headers=H(ADMIN)).status_code == 404
