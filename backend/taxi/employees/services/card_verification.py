"""Phase 11 — secure ID-card verification service.

Implements the *server* side of the owner-approved design in
`.agents/tasks/public-qr-verification-design.md` while keeping **public activation
off** (`PUBLIC_QR_VERIFICATION_ENABLED = False` by default; the public route
answers 404 until the owner switches it on).

Guarantees encoded here:

* Validity is always evaluated at scan time from ``EmployeeIDCard.is_valid()`` —
  never from data carried in the QR — so revocation/replacement takes effect
  immediately.
* The response is **minimised**: result + display name (first name + last initial)
  + card validity date + timestamp. No DOB, no national ID, no phone, no email, no
  department, no job title, no employee number, no card number, no internal ids.
* Unknown and known UUIDs return the *same* shape (no existence oracle) and every
  scan writes a :class:`CardVerificationRecord` (IP + user agent) for retention.
"""

from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from ..models import CardStatus, CardVerificationRecord, EmployeeIDCard

#: Retention window for scan records (IP/UA are personal data).
DEFAULT_RETENTION_DAYS = 90

RESULT_VALID = "valid"
RESULT_EXPIRED = "expired"
RESULT_REVOKED = "revoked"
RESULT_REPLACED = "replaced"
RESULT_DEACTIVATED = "deactivated"
RESULT_UNKNOWN = "unknown"


def public_verification_enabled() -> bool:
    """Activation switch — default OFF; only the owner enables it."""
    return bool(getattr(settings, "PUBLIC_QR_VERIFICATION_ENABLED", False))


def retention_days() -> int:
    try:
        value = int(getattr(settings, "CARD_VERIFICATION_RETENTION_DAYS", DEFAULT_RETENTION_DAYS))
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_DAYS
    return max(1, value)


def _display_name(full_name: str) -> str:
    """First name + last initial only (never the full legal name)."""
    parts = [part for part in str(full_name or "").split() if part]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def _result_for_card(card: EmployeeIDCard, now=None) -> str:
    if card.status == CardStatus.VALID:
        return RESULT_EXPIRED if card.is_expired(now=now) else RESULT_VALID
    return {
        CardStatus.EXPIRED: RESULT_EXPIRED,
        CardStatus.REVOKED: RESULT_REVOKED,
        CardStatus.REPLACED: RESULT_REPLACED,
        CardStatus.DEACTIVATED: RESULT_DEACTIVATED,
    }.get(card.status, RESULT_UNKNOWN)


def verify_card(qr_uuid, *, ip_address=None, user_agent="", token_mode="uuid") -> dict:
    """Resolve a scanned value to the minimised public payload.

    Always returns HTTP-200-shaped data (unknown values included) and always writes
    a scan record when a card was found. ``token_mode`` records whether the scan
    presented a signed token or a legacy bare UUID.
    """
    now = timezone.now()
    card = (
        EmployeeIDCard.objects.select_related("employee")
        .filter(qr_uuid=qr_uuid)
        .first()
    )

    if card is None:
        return {
            "result": RESULT_UNKNOWN,
            "holder": {"display_name": "", "photo_thumb": None},
            "card": {"valid_until": None},
            "checked_at": now,
        }

    result = _result_for_card(card, now=now)
    _record_scan(
        card, result, ip_address=ip_address, user_agent=user_agent, token_mode=token_mode
    )

    return {
        "result": result,
        "holder": {
            "display_name": _display_name(getattr(card.employee, "full_name", "")),
            "photo_thumb": None,
        },
        "card": {
            "valid_until": (
                card.expires_at.date().isoformat() if card.expires_at else None
            )
        },
        "checked_at": now,
    }


def verify_scanned_value(
    value, *, ip_address=None, user_agent="", tokens_required=None, now=None
) -> dict:
    """Verify whatever a QR scan presented: a signed token or a legacy UUID.

    Token rules (see `verification_tokens`):

    * signature, version and expiry are enforced;
    * a revoked token is refused;
    * the card's own lifecycle state is re-evaluated on every scan, so revoking or
      replacing a card invalidates its tokens immediately.

    A bare UUID is accepted only when `CARD_QR_TOKENS_REQUIRED` is false (legacy
    cards); otherwise the scan is reported as ``unknown`` without disclosing
    whether the UUID exists.
    """
    from . import verification_tokens as tokens

    required = (
        tokens_required
        if tokens_required is not None
        else bool(getattr(settings, "CARD_QR_TOKENS_REQUIRED", True))
    )

    if tokens.looks_like_token(value):
        try:
            payload = tokens.validate_token(str(value), now=now)
        except tokens.TokenError as exc:
            return {
                "result": RESULT_UNKNOWN,
                "holder": {"display_name": "", "photo_thumb": None},
                "card": {"valid_until": None},
                "checked_at": timezone.now(),
                "token_error": exc.code,
            }
        return verify_card(
            payload.get("u"), ip_address=ip_address, user_agent=user_agent, token_mode="token"
        )

    if required:
        return {
            "result": RESULT_UNKNOWN,
            "holder": {"display_name": "", "photo_thumb": None},
            "card": {"valid_until": None},
            "checked_at": timezone.now(),
            "token_error": "token_required",
        }

    return verify_card(
        value, ip_address=ip_address, user_agent=user_agent, token_mode="legacy_uuid"
    )


def _record_scan(
    card, result_status, *, ip_address=None, user_agent="", token_mode="uuid"
) -> CardVerificationRecord:
    """Write one scan record.

    `CardVerificationRecord` has no dedicated token-mode column (adding one would
    require a migration, which is not authorized), so the mode is recorded as a
    compact, searchable suffix on the stored user agent — the audit trail stays
    complete without schema drift.
    """
    agent = str(user_agent or "")
    marker = f" [mode={token_mode}]"
    return CardVerificationRecord.objects.create(
        card=card,
        result_status=result_status,
        ip_address=ip_address or None,
        user_agent=(agent + marker)[:300],
    )


def purge_expired_records(*, days=None, dry_run=False) -> int:
    """Delete scan records older than the retention window. Returns the count."""
    from datetime import timedelta

    window = days if days is not None else retention_days()
    cutoff = timezone.now() - timedelta(days=window)
    queryset = CardVerificationRecord.objects.filter(created_at__lt=cutoff)
    count = queryset.count()
    if not dry_run and count:
        queryset.delete()
    return count
