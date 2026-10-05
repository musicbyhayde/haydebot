"""
Role permissions for the dashboard API (/api/v1). Deny by default.

Roles come from public.dashboard_users (app/core/dashboard_users.py):
  admin, partner -> full access, as before (admin also: backup, user management)
  viewer         -> read-only: only the GET routes in VIEWER_GET_ALLOWED. Every other route
                    (any POST/PATCH/PUT/DELETE, and the GET routes in VIEWER_GET_DENIED) -> 403.
  anything else  -> 403.

Every protected route must be classified here: tests/test_viewer_access.py fails when a GET route
is in neither set, so a new endpoint is never readable by viewers without an explicit decision.
Paths are FastAPI route templates relative to the /api/v1 prefix (e.g. "/leads/{lead_id}/notes").
Depending on the FastAPI version request.scope["route"].path is with or without the prefix;
route_path() strips it so both work.
"""
from __future__ import annotations

from typing import Optional

FULL_ACCESS_ROLES = frozenset({"admin", "partner"})
VIEWER_ROLE = "viewer"
KNOWN_ROLES = FULL_ACCESS_ROLES | {VIEWER_ROLE}
READ_METHODS = frozenset({"GET", "HEAD"})

API_PREFIX = "/api/v1"

# Viewer may read: leads and everything on them (messages, notes, tasks, history, quote and
# closing amounts, the lead's own finance rows, calendar event), crew names (musicians list).
VIEWER_GET_ALLOWED = frozenset((
    "/me",
    "/leads",
    "/leads/unread-status",
    "/leads/{lead_id}/messages",
    "/leads/{lead_id}/notes",
    "/leads/{lead_id}/finance",
    "/leads/{lead_id}/calendar-event",
    "/notes/pending",
    "/tasks",
    "/activities",          # filtered: no finance entries without a lead (routes.get_activities)
    "/musicians",           # crew names on a lead; the musicians page itself is hidden
))

# Viewer may NOT read (Ilan 2026-10-05): finance table/summary, backup/export, analytics,
# musicians page data (stats, WhatsApp chats), videos, business contacts, user management.
VIEWER_GET_DENIED = frozenset((
    "/finance",
    "/finance/summary",
    "/backup/full",
    "/analytics",
    "/musicians/{musician_id}/stats",
    "/musicians/{musician_id}/messages",
    "/videos",
    "/business-contacts",
    "/admin/users",
))

# Non-GET routes a viewer may call because the endpoint turns them into a no-op for viewers.
VIEWER_NOOP = frozenset({
    ("POST", "/leads/{lead_id}/read"),   # Last_Read_At is shared: a viewer must not clear unread
})

VIEWER_DENIED_DETAIL = "משתמש צפייה בלבד: הפעולה לא זמינה"


def viewer_may(method: str, path: Optional[str]) -> bool:
    """True if a viewer may call `method path` (path = route template)."""
    if not path:
        return False
    method = (method or "").upper()
    if (method, path) in VIEWER_NOOP:
        return True
    return method in READ_METHODS and path in VIEWER_GET_ALLOWED


def strip_prefix(path: Optional[str]) -> Optional[str]:
    if path and path.startswith(API_PREFIX + "/"):
        return path[len(API_PREFIX):]
    return path


def route_path(request) -> Optional[str]:
    """Route template of the matched endpoint, relative to /api/v1."""
    route = request.scope.get("route")
    return strip_prefix(getattr(route, "path", None))


def is_viewer(request) -> bool:
    return getattr(request.state, "auth_role", None) == VIEWER_ROLE
