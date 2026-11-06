#!/usr/bin/env python3
"""Local credential rewriter for the YALA operator/QA scripts.

WHAT IT DOES
    Applies a fixed, reviewable set of credential-hygiene transformations to the
    remote-login, seeding and verification scripts:

      * removes log statements that interpolate a token or a delivery PIN
      * replaces hardcoded account identifiers (email / phone) with env lookups
      * replaces the leaked "what credentials do you use" prompt
      * makes TLS verification environment-controlled instead of always disabled

    It does NOT invent credentials, does NOT touch production data and does NOT
    rewrite git history.

SAFETY
    * Dry-run by default: prints a unified diff and writes nothing.
    * Values are REDACTED in the diff: every captured secret is replaced by
      ``<redacted len=N sha256=xxxxxxxx>`` so the tool can be reviewed and logged
      without exposing anything.
    * Idempotent: re-running reports "no changes".
    * Only the files in TARGETS are ever considered.

USAGE
    python scripts/cred_rewriter.py                # dry-run, full diff
    python scripts/cred_rewriter.py --summary      # dry-run, per-file counts
    python scripts/cred_rewriter.py --apply        # write the changes
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TARGETS = [
    "backend/taxi/cancel_remote.py",
    "backend/taxi/force_complete.py",
    "backend/taxi/verify_deploy.py",
    "backend/taxi/clean_remote.py",
    "backend/taxi/seed_fresh.py",
    "backend/taxi/scripts/seed_admin_driver_accounts.py",
    "backend/taxi/deliveries/management/commands/seed_delivery_couriers.py",
    "backend/taxi/operations/management/commands/day_zero_simulation.py",
    "scripts/sprint0_pilot_ride.py",
]

# Every capture group named in a rule is treated as sensitive and redacted in the diff.
REDACT_GROUP = 1


def redact(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:8]
    return f"<redacted len={len(value)} sha256={digest}>"


class Rule:
    """One transformation: a compiled pattern plus a replacement template."""

    def __init__(self, rule_id: str, description: str, pattern: str, replacement: str,
                 flags: int = re.MULTILINE):
        self.id = rule_id
        self.description = description
        self.pattern = re.compile(pattern, flags)
        self.replacement = replacement

    def apply(self, text: str) -> tuple[str, list[tuple[str, str]]]:
        """Return the rewritten text plus (before, after) pairs for the diff.

        The captured group is treated as the secret and is redacted in the pair, so
        the diff can be reviewed and archived without exposing a value.
        """
        changes: list[tuple[str, str]] = []

        def _sub(match: re.Match) -> str:
            before = match.group(0)
            after = match.expand(self.replacement)
            if before == after:
                return before
            secret = match.group(REDACT_GROUP) if match.re.groups >= REDACT_GROUP else ""
            if secret:
                masked = redact(secret)
                changes.append((before.replace(secret, masked), after.replace(secret, masked)))
            else:
                changes.append((before, after))
            return after

        return self.pattern.sub(_sub, text), changes


class InsertRule:
    """Inserts a block once, after an anchor line, when a sentinel is absent."""

    def __init__(self, rule_id: str, description: str, sentinel: str, anchor: str, block: str):
        self.id = rule_id
        self.description = description
        self.sentinel = sentinel
        self.anchor = re.compile(anchor, re.MULTILINE)
        self.block = block

    def apply(self, text: str) -> tuple[str, list[tuple[str, str]]]:
        if self.sentinel in text:
            return text, []
        match = self.anchor.search(text)
        if not match:
            return text, []
        insert_at = match.end()
        updated = text[:insert_at] + self.block + text[insert_at:]
        return updated, [("<absent>", self.block.strip())]


CRED_HELPER = """

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value

# TLS verification is ON unless the operator explicitly opts out for a throwaway host.
_TLS_VERIFY = _cred_os.environ.get("YALA_TLS_VERIFY", "1") != "0"
"""

TLS_BLOCK = """

# TLS verification is ON unless the operator explicitly opts out for a throwaway host.
_TLS_VERIFY = _cred_os.environ.get("YALA_TLS_VERIFY", "1") != "0"
"""


def build_rules() -> list:
    return [
        InsertRule(
            "add-credential-helper",
            "Insert the shared env-credential helper and TLS switch after the last import",
            sentinel="_required_env",
            anchor=r"^import urllib3[ \t]*$",
            block=CRED_HELPER,
        ),
        InsertRule(
            "add-tls-switch",
            "Add the TLS verification switch",
            sentinel="_TLS_VERIFY",
            anchor=r"^CTX = ssl\._create_unverified_context\(\)[ \t]*$",
            block=TLS_BLOCK,
        ),
        Rule(
            "redact-token-log",
            "Stop logging an access token",
            r'^([ \t]*)print\(f?["\']Token[^"\'\n]*\{[^}\n]*token[^}\n]*\}[^"\'\n]*["\']\)[ \t]*$',
            r"\1# Access-token value intentionally not logged.",
        ),
        Rule(
            "redact-pickup-pin-log",
            "Log only whether a pickup PIN is present",
            r'^([ \t]*)print\(f"([^"\n]*)pickup_pin: \{([^}\n]*)\}([^"\n]*)"\)[ \t]*$',
            r'\1print(f"\2pickup_pin present: {bool(\3)}\4")',
        ),
        Rule(
            "redact-dropoff-pin-log",
            "Log only whether a dropoff PIN is present",
            r'^([ \t]*)print\(f"([^"\n]*)dropoff_pin: \{([^}\n]*)\}([^"\n]*)"\)[ \t]*$',
            r'\1print(f"\2dropoff_pin present: {bool(\3)}\4")',
        ),
        Rule(
            "remove-credential-prompt",
            "Remove an in-script prompt that asks for credentials",
            r'^[ \t]*print\(["\'][^"\'\n]*What credentials do you use\?[^"\'\n]*["\']\)[ \t]*$',
            "    # (removed) a script must never prompt for credentials; use environment variables.",
        ),
        Rule(
            "env-login-email",
            "Move the hardcoded login email to an environment variable",
            r'"email":\s*"([^"@\s]+@[^"\s]+)"',
            '"email": _required_env("YALA_QA_LOGIN_EMAIL")',
        ),
        Rule(
            "env-login-phone",
            "Move the hardcoded login phone number to an environment variable",
            r'"phone_number":\s*"(\+?[0-9]{6,})"',
            '"phone_number": _required_env("YALA_QA_LOGIN_PHONE")',
        ),
        Rule(
            "env-tls-verify",
            "Make TLS verification opt-out instead of always disabled",
            r"\bverify=False\b",
            "verify=_TLS_VERIFY",
        ),
        Rule(
            "env-tls-verify-urllib",
            "Make TLS verification opt-out instead of always disabled (urllib)",
            r"CTX = ssl\._create_unverified_context\(\)",
            "CTX = ssl._create_unverified_context() if not _TLS_VERIFY else ssl.create_default_context()",
        ),
    ]

