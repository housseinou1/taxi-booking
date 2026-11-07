"""Protected storage for the official CEO electronic signature (ID cards).

Separate from per-employee signatures — at most one active asset, replace-only
by administrator tier, never exposed on a public URL.
"""

from __future__ import annotations

from employees.services import signature_storage

_SUBDIR = "ceo_id_card_signatures"


def save_ceo_signature(raw: bytes) -> str:
    return signature_storage.save_signature(raw)


def replace_ceo_signature(old_key: str, raw: bytes) -> str:
    return signature_storage.replace_signature(old_key, raw)


def delete_ceo_signature(key: str) -> bool:
    return signature_storage.delete_signature(key)


def open_ceo_signature(key: str):
    return signature_storage.open_signature(key)
