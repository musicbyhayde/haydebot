"""One error format for every /api/bot/* response:

    {"error": {"status": 403, "code": "insufficient_scope", "message": "..."}}

Other paths keep FastAPI's default error responses.
Expected failures use 4xx only (incl. 424 for "database unreachable, retry"): DigitalOcean's edge
replaces any 5xx with an HTML 504 page, so a 5xx body would never reach the bot.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

BOT_PREFIX = "/api/bot/"

ERROR_CODES = {
    400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found",
    405: "method_not_allowed", 422: "invalid_request", 424: "failed_dependency", 429: "rate_limited",
    500: "internal_error", 502: "upstream_error", 503: "unavailable",
}


class BotError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: Optional[dict] = None):
        super().__init__(message)
        self.status, self.code, self.message, self.headers = status, code, message, headers


def is_bot_path(path: str) -> bool:
    return path.startswith(BOT_PREFIX)


def error_response(request: Request, status: int, code: str, message: str,
                   headers: Optional[dict] = None) -> JSONResponse:
    request.state.bot_error_code = code
    return JSONResponse({"error": {"status": status, "code": code, "message": message}},
                        status_code=status, headers=headers)


async def _bot_error(request: Request, exc: BotError):
    return error_response(request, exc.status, exc.code, exc.message, exc.headers)


async def _http_error(request: Request, exc: StarletteHTTPException):
    if not is_bot_path(request.url.path):
        return await http_exception_handler(request, exc)
    msg = exc.detail if isinstance(exc.detail, str) else ERROR_CODES.get(exc.status_code, "error")
    return error_response(request, exc.status_code, ERROR_CODES.get(exc.status_code, "error"), msg,
                          getattr(exc, "headers", None))


async def _validation_error(request: Request, exc: RequestValidationError):
    if not is_bot_path(request.url.path):
        return await request_validation_exception_handler(request, exc)
    parts = []
    for e in exc.errors()[:5]:
        loc = ".".join(str(x) for x in e.get("loc", ()) if x not in ("query", "path", "body"))
        parts.append(f"{loc}: {e.get('msg')}")
    return error_response(request, 422, "invalid_request", "; ".join(parts) or "invalid request")


def install(app: FastAPI) -> None:
    app.add_exception_handler(BotError, _bot_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
