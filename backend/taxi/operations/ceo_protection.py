"""Founder/CEO account protection (Phase 10).

A single, shared definition of "protected account" so every administrative
surface refuses to modify the Founder/CEO (or any peer CEO-tier account):

- the platform **superuser**,
- any staff account in :data:`CEO_ONLY_GROUPS` (``CEO`` / ``Super Admin``),
- the acting account itself (self-protection).

Nothing here mutates data — the helpers are consumed by the roles/permissions
endpoints and asserted against the pre-existing account endpoints by tests.
"""

from __future__ import annotations

from .executive_permissions import CEO_ONLY_GROUPS

PROTECTED_CEO_GROUPS = CEO_ONLY_GROUPS

PROTECTED_ACCOUNT_MESSAGE = (
    "This account holds protected Founder/CEO authority and cannot be modified, "
    "demoted, suspended or deleted by any administrator."
)


def is_protected_account(user) -> bool:
    """True for superusers and any CEO-tier (CEO / Super Admin) staff account."""
    if user is None:
        return False
    if getattr(user, "is_superuser", False):
        return True
    if not getattr(user, "is_staff", False):
        return False
    return user.groups.filter(name__in=PROTECTED_CEO_GROUPS).exists()


def is_protected_ceo(user) -> bool:
    """Alias kept explicit for readability at call sites."""
    return is_protected_account(user)


def protection_refusal(target, actor=None) -> str | None:
    """Return a refusal message when ``target`` must not be modified, else None.

    ``actor`` enables the self-protection rule (an administrator may never change
    its own governance state through these endpoints).
    """
    if target is None:
        return "Account not found."
    if actor is not None and target.pk == actor.pk:
        return "You cannot change your own administrative access."
    if is_protected_account(target):
        return PROTECTED_ACCOUNT_MESSAGE
    return None


def protection_summary() -> dict:
    """Machine-readable description used by the security/permission payloads."""
    return {
        "protected_groups": sorted(PROTECTED_CEO_GROUPS),
        "superusers_protected": True,
        "self_modification_blocked": True,
        "guarantees": [
            "No administrator action can demote, suspend, deactivate or delete a protected account.",
            "CEO/Super Admin authority cannot be granted through the roles API.",
            "Every refused attempt is answered with an explicit reason, never silently.",
        ],
    }
