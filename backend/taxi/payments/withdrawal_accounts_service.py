"""Platform withdrawal account configuration for driver/courier payouts."""

from __future__ import annotations

import os
from typing import Any

from .models import PlatformWithdrawalAccounts

_ENV_KEYS = {
    "bankily_number": "YALA_WITHDRAWAL_BANKILY_NUMBER",
    "seddad_number": "YALA_WITHDRAWAL_SEDDAD_NUMBER",
    "masravi_number": "YALA_WITHDRAWAL_MASRAVI_NUMBER",
}

_DEFAULTS = {
    "bankily_number": "22114373",
    "seddad_number": "22114373",
    "masravi_number": "22114373",
}


def _env_or_default(field: str) -> str:
    return os.getenv(_ENV_KEYS[field], _DEFAULTS[field])


def get_platform_withdrawal_accounts() -> PlatformWithdrawalAccounts:
    obj, created = PlatformWithdrawalAccounts.objects.get_or_create(
        key=PlatformWithdrawalAccounts.PLATFORM_KEY,
        defaults={
            "bankily_number": _env_or_default("bankily_number"),
            "seddad_number": _env_or_default("seddad_number"),
            "masravi_number": _env_or_default("masravi_number"),
        },
    )
    if created:
        return obj

    updates: dict[str, str] = {}
    for field in _DEFAULTS:
        if not getattr(obj, field):
            updates[field] = _env_or_default(field)
    if updates:
        for field, value in updates.items():
            setattr(obj, field, value)
        obj.save(update_fields=[*updates.keys(), "updated_at"])
    return obj


def build_withdrawal_methods_payload(
    accounts: PlatformWithdrawalAccounts,
) -> list[dict[str, Any]]:
    return [
        {
            "id": "bankily",
            "label": "Bankily",
            "payout_type": "bankily",
            "destination": accounts.bankily_number,
        },
        {
            "id": "sedad",
            "label": "Sedad",
            "payout_type": "sedad",
            "destination": accounts.seddad_number,
        },
        {
            "id": "masravi",
            "label": "Masravi",
            "payout_type": "masravi",
            "destination": accounts.masravi_number,
        },
    ]


def serialize_platform_withdrawal_accounts(
    accounts: PlatformWithdrawalAccounts,
    *,
    include_meta: bool = False,
) -> dict[str, Any]:
    payload = {
        "bankily_number": accounts.bankily_number,
        "seddad_number": accounts.seddad_number,
        "masravi_number": accounts.masravi_number,
        "methods": build_withdrawal_methods_payload(accounts),
    }
    if include_meta:
        payload["updated_at"] = accounts.updated_at.isoformat() if accounts.updated_at else None
        payload["updated_by"] = accounts.updated_by_id
        payload["updated_by_email"] = (
            accounts.updated_by.email if accounts.updated_by_id and accounts.updated_by else ""
        )
    return payload
