"""Secure ID-card verification tokens (Phase 11 completion).

A stateless, signed, expiring credential carried by the QR code. Design goals from
`.agents/tasks/public-qr-verification-design.md` §3.3–§3.5:

* **Secure verification tokens** — `base64url(<uuid>.<issued>.<expires>.<key_id>)`
  followed by an HMAC-SHA256 tag over that payload, so a token cannot be forged,
  edited or replayed across keys.
* **Expiration** — every token carries an explicit `exp` claim (default 24 h,
  never beyond the card's own expiry).
* **Revocation** — two independent mechanisms: (a) card lifecycle state is always
  re-evaluated at scan time (revoked/replaced/deactivated/expired cards invalidate
  their tokens immediately), and (b) an explicit short-lived denylist keyed by the
  token's `jti`, stored in the cache with a TTL equal to the token's remaining
  lifetime — it therefore cleans itself up and can also be cleared explicitly.
* **Retention and cleanup** — `purge_expired_tokens()` removes expired denylist
  entries and reports counts; scan records are purged separately by
  `purge_card_verification_records`.
* **Key rotation** — `CARD_QR_TOKEN_KEYS` maps `key_id -> secret`; the newest entry
  signs, older entries still verify during a rotation window.

Nothing here activates public verification: the public route stays 404 until the
owner enables `PUBLIC_QR_VERIFICATION_ENABLED`.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from django.conf import settings
from django.core.cache import cache

TOKEN_VERSION = 1
DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24 hours
DENYLIST_KEY_PREFIX = "cardqr:denied:"


class TokenError(Exception):
    """Raised when a token is malformed, forged, expired or revoked."""

    code = "invalid_token"

    def __init__(self, reason: str, code: str | None = None):
        super().__init__(reason)
        self.reason = reason
        if code:
            self.code = code


def _keys() -> dict[str, str]:
    """Signing keys by id (newest signs; older ones verify during rotation)."""
    configured = getattr(settings, "CARD_QR_TOKEN_KEYS", None)
    if configured:
        return {str(key): str(value) for key, value in dict(configured).items()}
    secret = getattr(settings, "CARD_QR_TOKEN_SECRET", "") or settings.SECRET_KEY
    return {"k1": str(secret)}


def current_key_id() -> str:
    return list(_keys().keys())[-1]


def ttl_seconds() -> int:
    try:
        value = int(getattr(settings, "CARD_QR_TOKEN_TTL_SECONDS", DEFAULT_TTL_SECONDS))
    except (TypeError, ValueError):
        return DEFAULT_TTL_SECONDS
    return max(60, value)


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(key_id: str, payload_b64: str) -> str:
    secret = _keys()[key_id]
    return hmac.new(
        secret.encode("utf-8"), f"{TOKEN_VERSION}.{payload_b64}".encode("ascii"), hashlib.sha256
    ).hexdigest()


def issue_token(*, qr_uuid, card_expires_at=None, ttl=None, now=None) -> dict:
    """Issue a signed verification token for a card UUID.

    The effective lifetime is the smaller of the configured TTL and the card's
    remaining validity, so a token can never outlive the card it identifies.
    """
    now_ts = int(now if now is not None else time.time())
    lifetime = ttl or ttl_seconds()
    if card_expires_at is not None:
        remaining = int(card_expires_at.timestamp()) - now_ts
        lifetime = min(lifetime, remaining)
    if lifetime <= 0:
        raise TokenError("The card has expired; no verification token was issued.")

    key_id = current_key_id()
    payload = {
        "v": TOKEN_VERSION,
        "u": str(qr_uuid),
        "iat": now_ts,
        "exp": now_ts + lifetime,
        "k": key_id,
        "jti": secrets.token_hex(8),
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return {
        "token": f"{payload_b64}.{_sign(key_id, payload_b64)}",
        "key_id": key_id,
        "issued_at": now_ts,
        "expires_at": payload["exp"],
        "expires_in": lifetime,
        "jti": payload["jti"],
        "qr_uuid": str(qr_uuid),
    }


def validate_token(token: str, *, now=None) -> dict:
    """Validate signature, structure, expiry and revocation. Raises on failure."""
    now_ts = int(now if now is not None else time.time())
    if not token or "." not in str(token):
        raise TokenError("Malformed verification token.", code="malformed")

    payload_b64, _, signature = str(token).partition(".")
    try:
        payload = json.loads(_b64decode(payload_b64).decode("utf-8"))
    except Exception:
        raise TokenError("Malformed verification token.", code="malformed")

    key_id = str(payload.get("k", ""))
    if key_id not in _keys():
        raise TokenError("Unknown signing key.", code="unknown_key")

    expected = _sign(key_id, payload_b64)
    if not hmac.compare_digest(str(signature), expected):
        raise TokenError("Invalid token signature.", code="bad_signature")

    if int(payload.get("v", 0)) != TOKEN_VERSION:
        raise TokenError("Unsupported token version.", code="bad_version")

    if int(payload.get("exp", 0)) <= now_ts:
        raise TokenError("The verification token has expired.", code="expired")

    if is_revoked(payload.get("jti", "")):
        raise TokenError("The verification token has been revoked.", code="revoked")

    return payload


def looks_like_token(value: str) -> bool:
    """True when a scanned value is a signed token rather than a bare UUID."""
    return "." in str(value or "")


def revoke_token(token_or_jti: str, *, now=None, reason: str = "") -> str:
    """Revoke a token (by token or jti). The denylist entry expires with the token."""
    now_ts = int(now if now is not None else time.time())
    if looks_like_token(token_or_jti):
        try:
            payload = validate_token(token_or_jti, now=now_ts)
        except TokenError as exc:
            if exc.code != "expired":
                raise
            payload_b64 = str(token_or_jti).partition(".")[0]
            payload = json.loads(_b64decode(payload_b64).decode("utf-8"))
        jti = str(payload.get("jti", ""))
        expires_at = int(payload.get("exp", now_ts))
    else:
        jti = str(token_or_jti)
        expires_at = now_ts + ttl_seconds()

    if not jti:
        raise TokenError("Cannot revoke a token without a jti.", code="malformed")

    remaining = max(1, expires_at - now_ts)
    cache.set(f"{DENYLIST_KEY_PREFIX}{jti}", reason or "revoked", timeout=remaining)
    return jti


def is_revoked(jti: str) -> bool:
    if not jti:
        return False
    return cache.get(f"{DENYLIST_KEY_PREFIX}{jti}") is not None


def purge_expired_tokens() -> dict:
    """Clear expired denylist entries.

    Denylist entries carry a TTL equal to the token lifetime, so they expire on
    their own; this performs the explicit cleanup sweep (and is a no-op on cache
    backends that expose no key listing, which is reported honestly).
    """
    pattern = f"{DENYLIST_KEY_PREFIX}*"
    removed = 0
    unsupported = False
    try:
        keys = cache.keys(pattern)
    except Exception:
        unsupported = True
        keys = []
    for key in keys or []:
        # Expired entries are already gone on TTL backends; anything still present
        # is live, so it is left alone. Deleting here would defeat revocation.
        if cache.get(key) is None:
            cache.delete(key)
            removed += 1
    return {
        "removed": removed,
        "scanned": len(keys or []),
        "ttl_based": True,
        "key_listing_supported": not unsupported,
        "retention_seconds": ttl_seconds(),
    }


def token_stats() -> dict:
    """Read-only summary for the CEO security console."""
    return {
        "enabled": True,
        "version": TOKEN_VERSION,
        "ttl_seconds": ttl_seconds(),
        "key_ids": sorted(_keys().keys()),
        "current_key_id": current_key_id(),
        "signed": True,
        "revocation": "cache denylist (TTL = token lifetime) + card lifecycle",
        "retention": "denylist self-expires; scan records purged by retention command",
    }

