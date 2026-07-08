"""Short-lived pending tokens for admin password→2FA login step."""

from __future__ import annotations

import secrets
from typing import Optional

from django.core.cache import cache

PENDING_TTL_SECONDS = 300
PENDING_PREFIX = "admin2fa:pending:"


def issue_pending_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    cache.set(f"{PENDING_PREFIX}{token}", int(user_id), timeout=PENDING_TTL_SECONDS)
    return token


def consume_pending_token(token: str) -> Optional[int]:
    if not token:
        return None
    key = f"{PENDING_PREFIX}{token}"
    user_id = cache.get(key)
    if user_id is None:
        return None
    cache.delete(key)
    return int(user_id)


def peek_pending_token(token: str) -> Optional[int]:
    if not token:
        return None
    user_id = cache.get(f"{PENDING_PREFIX}{token}")
    return int(user_id) if user_id is not None else None
