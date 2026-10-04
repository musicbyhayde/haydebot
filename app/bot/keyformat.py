"""Bot API key format + hashing. Pure module (used by the backend and by scripts/bot_keys.py).

Key:    hbk_<8 hex id>_<43 url-safe chars>   (~256 bits of randomness)
Stored: sha256(key) as hex + the non-secret prefix 'hbk_<8 hex id>'.
A fast hash is fine here: the keys are long random secrets, not passwords, so they cannot be
brute-forced from the hash; bcrypt/argon2 would only add latency to every request.
"""
from __future__ import annotations

import hashlib
import re
import secrets

_KEY_RE = re.compile(r"^hbk_[0-9a-f]{8}_[A-Za-z0-9_-]{32,64}$")


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def key_prefix(key: str) -> str:
    return key[:12]


def looks_like_key(value: str | None) -> bool:
    return bool(value) and bool(_KEY_RE.match(value))


def generate_key() -> tuple[str, str, str]:
    """-> (plaintext key, prefix, sha256 hex). Show the plaintext once; store only the rest."""
    key = f"hbk_{secrets.token_hex(4)}_{secrets.token_urlsafe(32)}"
    return key, key_prefix(key), hash_key(key)
