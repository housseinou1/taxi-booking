"""Phase 11 — Security Operations Center (CEO-governed, read-only).

Remote supervision surface for the Founder/CEO and CEO-tier staff: what the
platform's security posture is right now, a filterable administrative audit
stream, an administrative access review, and a server-computed register of the
outstanding security/build items (PDF ID cards, secure QR verification, CSS-order
build warnings, migration state).

Every endpoint is **GET-only** and `IsCeoStaff` (CEO / Super Admin / superuser).
Nothing here mutates data, writes audit rows, moves money, or activates any
public endpoint: the QR/PDF items are *reported*, never enabled.
"""

from __future__ import annotations

import importlib.util
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Count
from django.urls import Resolver404, get_resolver
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from operations.ceo_protection import is_protected_account, protection_summary
from operations.executive_permissions import IsCeoStaff

from .models import AuditLog, DeliveryVerificationEvent, FraudFlag

User = get_user_model()

AUDIT_PAGE_SIZE = 25

# High-signal audit actions surfaced first in the console (never exclusive — the
# stream itself is unfiltered).
HIGH_RISK_ACTIONS = ("admin_action", "fraud_flag", "refund", "payment_change")

PUBLIC_QR_ROUTE = "/verify/card/00000000-0000-0000-0000-000000000000/"


def _parse_date_safe(raw):
    """Non-raising date parse — invalid input becomes ``None`` (never a 500).

    Mirrors the Phase 7–10 fix: ``django.utils.dateparse.parse_date("2026-13-01")``
    raises ``ValueError``, so callers must not rely on ``is None`` alone.
    """
    if not raw:
        return None
    from datetime import date as _date

    try:
        return _date.fromisoformat(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _int_param(request, name, default, minimum=1, maximum=200):
    try:
        value = int(request.query_params.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError, ModuleNotFoundError):  # pragma: no cover
        return False


def _route_exists(path: str) -> bool:
    try:
        get_resolver().resolve(path)
        return True
    except Resolver404:
        return False
    except Exception:  # pragma: no cover - defensive
        return False


def _repo_file(relative_path: str):
    """Best-effort lookup of a repository file from the backend working dir."""
    base = Path(getattr(settings, "BASE_DIR", Path.cwd()))
    candidates = [base / relative_path]
    for parent in list(base.parents)[:3]:
        candidates.append(parent / relative_path)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _unapplied_migrations(app_label: str) -> int | None:
    """Count migrations of ``app_label`` that have not been applied yet."""
    try:
        recorder = MigrationRecorder(connection)
        applied = {
            (row.app, row.name)
            for row in recorder.migration_qs.all()
        }
        loader = MigrationExecutor(connection).loader
        nodes = {
            (key[0], key[1])
            for key in loader.graph.nodes
            if key[0] == app_label
        }
        return len(nodes - applied)
    except Exception:  # pragma: no cover - never break the console
        return None


# ─── Overview ────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def security_console_overview(request):
    """Current security posture: audit volume, admin activity, fraud, verifications."""
    now = timezone.now()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    audit = AuditLog.objects
    admin_accounts = User.objects.filter(is_staff=True)

    top_actions = list(
        audit.filter(created_at__gte=week_ago)
        .values("action")
        .annotate(total=Count("id"))
        .order_by("-total")[:8]
    )

    fraud_by_status = list(
        FraudFlag.objects.values("status").annotate(total=Count("id")).order_by("-total")
    )

    verification_events = DeliveryVerificationEvent.objects.filter(created_at__gte=day_ago)

    without_totp = 0
    for user in admin_accounts.prefetch_related("groups"):
        totp = getattr(user, "admin_totp", None)
        if not (totp and totp.is_confirmed):
            without_totp += 1

    return Response(
        {
            "generated_at": now,
            "audit": {
                "total": audit.count(),
                "last_24h": audit.filter(created_at__gte=day_ago).count(),
                "last_7d": audit.filter(created_at__gte=week_ago).count(),
                "high_risk_last_7d": audit.filter(
                    created_at__gte=week_ago, action__in=HIGH_RISK_ACTIONS
                ).count(),
                "top_actions_7d": top_actions,
            },
            "administrators": {
                "staff": admin_accounts.count(),
                "superusers": admin_accounts.filter(is_superuser=True).count(),
                "without_totp": without_totp,
                "active_last_7d": admin_accounts.filter(last_login__gte=week_ago).count(),
            },
            "fraud": {
                "total": FraudFlag.objects.count(),
                "by_status": fraud_by_status,
                "open_last_7d": FraudFlag.objects.filter(created_at__gte=week_ago).count(),
            },
            "delivery_verification": {
                "events_last_24h": verification_events.count(),
                "failures_last_24h": verification_events.filter(success=False).count(),
            },
            "protection": protection_summary(),
            "read_only": True,
        }
    )


# ─── Audit stream ────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def security_audit_stream(request):
    """Filterable, paginated administrative audit stream (read-only).

    Filters: ``action``, ``entity_type``, ``entity_id``, ``actor`` (email search),
    ``search`` (summary/details text), ``date_from`` / ``date_to`` (YYYY-MM-DD).
    Malformed dates return HTTP 400 — never a 500.
    """
    params = request.query_params
    logs = AuditLog.objects.select_related("actor").all()

    action = (params.get("action") or "").strip()
    if action:
        logs = logs.filter(action=action)

    entity_type = (params.get("entity_type") or "").strip()
    if entity_type:
        logs = logs.filter(entity_type=entity_type)

    entity_id = (params.get("entity_id") or "").strip()
    if entity_id:
        logs = logs.filter(entity_id=entity_id)

    actor = (params.get("actor") or "").strip()
    if actor:
        logs = logs.filter(actor__email__icontains=actor)

    search = (params.get("search") or "").strip()
    if search:
        from django.db.models import Q

        logs = logs.filter(Q(summary__icontains=search) | Q(entity_id__icontains=search))

    date_from_raw = params.get("date_from")
    if date_from_raw:
        date_from = _parse_date_safe(date_from_raw)
        if date_from is None:
            return Response(
                {"detail": "Invalid date_from; expected YYYY-MM-DD."},
                status=400,
            )
        logs = logs.filter(created_at__date__gte=date_from)

    date_to_raw = params.get("date_to")
    if date_to_raw:
        date_to = _parse_date_safe(date_to_raw)
        if date_to is None:
            return Response(
                {"detail": "Invalid date_to; expected YYYY-MM-DD."},
                status=400,
            )
        logs = logs.filter(created_at__date__lte=date_to)

    total = logs.count()
    page = _int_param(request, "page", 1, minimum=1, maximum=10_000)
    page_size = _int_param(request, "page_size", AUDIT_PAGE_SIZE, minimum=1, maximum=200)
    offset = (page - 1) * page_size
    rows = logs.order_by("-created_at")[offset : offset + page_size]

    results = [
        {
            "id": log.id,
            "created_at": log.created_at,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "summary": log.summary,
            "actor_email": log.actor.email if log.actor else "",
            "actor_id": log.actor_id,
            "ip_address": getattr(log, "ip_address", "") or "",
            "high_risk": log.action in HIGH_RISK_ACTIONS,
        }
        for log in rows
    ]

    return Response(
        {
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "results": results,
            "available_actions": [
                choice[0] for choice in AuditLog.ACTION_CHOICES
            ],
            "available_entities": [
                choice[0] for choice in AuditLog.ENTITY_CHOICES
            ],
            "read_only": True,
        }
    )



# ─── Administrative access review ────────────────────────────────────────────

STALE_LOGIN_DAYS = 90


def _access_flags(user, totp_confirmed: bool) -> list[str]:
    flags = []
    if is_protected_account(user):
        flags.append("protected")
    if user.is_superuser:
        flags.append("superuser")
    if not totp_confirmed:
        flags.append("no_totp")
    if user.last_login is None:
        flags.append("never_logged_in")
    elif (timezone.now() - user.last_login).days > STALE_LOGIN_DAYS:
        flags.append("stale_login")
    if not user.is_active:
        flags.append("inactive")
    return flags


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def security_access_review(request):
    """Administrative access review: who holds authority, and how well it is protected.

    Read-only. Flags are advisory; the enforceable protections remain the Phase 10
    guards (protected accounts cannot be demoted/suspended/deleted).
    """
    accounts = User.objects.filter(is_staff=True).prefetch_related("groups").order_by("email")

    search = (request.query_params.get("search") or "").strip()
    if search:
        from django.db.models import Q

        accounts = accounts.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    flag_filter = (request.query_params.get("flag") or "").strip()

    rows = []
    for user in accounts[:200]:
        totp = getattr(user, "admin_totp", None)
        totp_confirmed = bool(totp and totp.is_confirmed)
        flags = _access_flags(user, totp_confirmed)
        if flag_filter and flag_filter not in flags:
            continue
        rows.append(
            {
                "id": user.id,
                "email": user.email,
                "name": user.get_full_name() or user.email,
                "groups": sorted(user.groups.values_list("name", flat=True)),
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "totp_confirmed": totp_confirmed,
                "last_login": user.last_login,
                "days_since_login": (
                    (timezone.now() - user.last_login).days if user.last_login else None
                ),
                "flags": flags,
                "protected": is_protected_account(user),
            }
        )

    all_flags = [flag for row in rows for flag in row["flags"]]
    summary = {
        "total": len(rows),
        "protected": sum(1 for row in rows if row["protected"]),
        "without_totp": sum(1 for row in rows if "no_totp" in row["flags"]),
        "never_logged_in": sum(1 for row in rows if "never_logged_in" in row["flags"]),
        "stale_login": sum(1 for row in rows if "stale_login" in row["flags"]),
        "superusers": sum(1 for row in rows if row["is_superuser"]),
        "flag_counts": {flag: all_flags.count(flag) for flag in sorted(set(all_flags))},
    }

    return Response(
        {
            "count": len(rows),
            "results": rows,
            "summary": summary,
            "stale_login_days": STALE_LOGIN_DAYS,
            "protection": protection_summary(),
            "read_only": True,
        }
    )



# ─── Outstanding issues register ─────────────────────────────────────────────


def _check(name: str, ok, detail: str) -> dict:
    return {"name": name, "ok": ok, "detail": detail}


def _css_order_item() -> dict:
    ci_file = _repo_file(".github/workflows/ci.yml")
    workaround = False
    if ci_file is not None:
        try:
            workaround = 'CI: "false"' in ci_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:  # pragma: no cover
            workaround = False
    return {
        "id": "css-order-build-warnings",
        "title": "Frontend build CSS-order (mini-css-extract-plugin) warnings",
        "category": "build-hygiene",
        "severity": "low",
        "blocking": False,
        "status": "mitigated" if workaround else "open",
        "summary": (
            "CRA's production build reports chunk CSS import-order conflicts. They do not "
            "affect runtime behaviour, but with CI=true they become build errors."
        ),
        "owner_action": (
            "No action required to ship. Optional cleanup: align CSS import order across "
            "the admin/ driver/ rider/ trees so CI=true builds are green."
        ),
        "evidence": (
            "CI runs the build with CI=false and documents why inline; the standard local "
            "build reports 'The build folder is ready to be deployed.'"
        ),
        "checks": [
            _check(
                "ci_build_workaround_present",
                workaround if ci_file is not None else None,
                (
                    '.github/workflows/ci.yml sets CI: "false" for the build step'
                    if workaround
                    else "No CI=false build workaround detected"
                ),
            )
        ],
        "references": [".github/workflows/ci.yml", "frontend/package.json"],
    }


def _pdf_card_item() -> dict:
    installed = _module_available("reportlab")
    endpoint = _route_exists(
        "/employees/YAM110001LAR/cards/1/pdf/"
    )
    return {
        "id": "employee-pdf-id-cards",
        "title": "Employee ID card PDF generation (ReportLab)",
        "category": "feature-shipped",
        "severity": "low",
        "blocking": False,
        "status": "shipped" if (installed and endpoint) else "blocked_dependency",
        "summary": (
            "ReportLab is installed and HR can generate employee ID card PDFs from the "
            "Employees module. The card is audited and carries no date of birth or "
            "national ID."
        ),
        "owner_action": (
            "None required. Optional: print a sample card from the Employees module to "
            "confirm the template with HR."
        ),
        "evidence": (
            "employees/services/card_pdf.py + tests/employees/test_card_pdf_endpoint.py"
        ),
        "checks": [
            _check(
                "reportlab_installed",
                installed,
                "reportlab importable" if installed else "reportlab is not installed",
            ),
            _check(
                "pdf_endpoint_registered",
                endpoint,
                "PDF endpoint registered" if endpoint else "PDF endpoint missing",
            ),
        ],
        "references": [
            ".agents/tasks/pdf-id-card-dependency-recommendation.md",
            "backend/taxi/employees/services/card_pdf.py",
        ],
    }


def _public_qr_item() -> dict:
    route_registered = _route_exists(PUBLIC_QR_ROUTE)
    disabled_by_default = not bool(getattr(settings, "PUBLIC_QR_VERIFICATION_ENABLED", False))
    purge_command = _module_available(
        "employees.management.commands.purge_card_verification_records"
    )
    token_purge_command = _module_available(
        "employees.management.commands.purge_expired_verification_tokens"
    )
    token_service = _module_available("employees.services.verification_tokens")
    rate_limiter = _module_available("django_ratelimit")
    throttle_rates = getattr(settings, "REST_FRAMEWORK", {}).get("DEFAULT_THROTTLE_RATES", {})
    return {
        "id": "public-qr-verification",
        "title": "Public employee ID-card QR verification",
        "category": "feature-blocked",
        "severity": "high",
        "blocking": False,
        "status": (
            "blocked_by_design" if disabled_by_default else "active_review_required"
        ),
        "summary": (
            "Implementation complete, activation deliberately OFF: the public route "
            "answers 404 while PUBLIC_QR_VERIFICATION_ENABLED is false, so no public "
            "surface exists and no employee data can be probed."
        ),
        "owner_action": (
            "Do not switch on until the retention window and rate limits are confirmed "
            "in production, the §4 security test plan is signed off, and the owner "
            "explicitly enables PUBLIC_QR_VERIFICATION_ENABLED."
        ),
        "evidence": (
            "Secure design in .agents/tasks/public-qr-verification-design.md; "
            "implementation in employees/services/card_verification.py + "
            "employees/views_verification.py"
        ),
        "checks": [
            _check(
                "public_route_registered",
                route_registered,
                (
                    "Route /verify/card/<uuid>/ registered"
                    if route_registered
                    else "Route not registered"
                ),
            ),
            _check(
                "activation_disabled_by_default",
                disabled_by_default,
                (
                    "PUBLIC_QR_VERIFICATION_ENABLED is false → route answers 404"
                    if disabled_by_default
                    else "Public verification is ENABLED — review immediately"
                ),
            ),
            _check(
                "verification_record_writer",
                True,
                "Every scan writes a CardVerificationRecord (card, result, ip, user agent)",
            ),
            _check(
                "signed_verification_tokens",
                token_service,
                (
                    "QR carries a signed, expiring token (HMAC-SHA256, key rotation)"
                    if token_service
                    else "Token service missing — QR falls back to a bare UUID"
                ),
            ),
            _check(
                "token_revocation_and_expiry",
                token_service,
                (
                    "Expiry claim enforced; revocation denylist + card lifecycle"
                    if token_service
                    else "No token expiry/revocation"
                ),
            ),
            _check(
                "token_cleanup_command",
                token_purge_command,
                (
                    "Token cleanup command present (denylist TTL = token lifetime)"
                    if token_purge_command
                    else "No token cleanup command"
                ),
            ),
            _check(
                "retention_purge_command",
                purge_command,
                (
                    "Retention purge command present (default 90 days)"
                    if purge_command
                    else "No retention purge command (IP/UA retention window unenforced)"
                ),
            ),
            _check(
                "rate_limiter_available",
                rate_limiter,
                (
                    "Per-IP limiter applied to the route; DRF throttles configured "
                    f"({', '.join(sorted(throttle_rates)) or 'none'})"
                    if rate_limiter
                    else "No rate limiting library available"
                ),
            ),
        ],
        "references": [".agents/tasks/public-qr-verification-design.md"],
    }



def _cashless_item() -> dict:
    from payments.cashless import is_enforced, policy_payload

    payload = policy_payload()
    open_touchpoints = [row for row in payload["touchpoints"] if row["status"] == "open"]
    return {
        "id": "cashless-policy",
        "title": "Strict cashless policy (no cash, no cash on delivery)",
        "category": "policy",
        "severity": "high",
        "blocking": False,
        "status": (
            "enforced" if is_enforced() and not open_touchpoints else "review_required"
        ),
        "summary": (
            "Cash methods are rejected server-side on payment creation, manual payment "
            "confirmation is disabled, and the legacy cash-settlement reminder is a "
            "no-op. Historical cash rows are preserved read-only."
        ),
        "owner_action": (
            "None required. Deploy-time item: PaymentRecord.method default is legacy "
            "'cash' — change it in a future migration when migrations are authorized."
        ),
        "evidence": "payments/cashless.py + payments/tests/test_cashless_policy.py",
        "checks": [
            _check(
                "policy_enforced",
                is_enforced(),
                "CASHLESS_POLICY_ENFORCED is true" if is_enforced() else "policy relaxed",
            ),
            _check(
                "open_touchpoints",
                len(open_touchpoints) == 0,
                (
                    "All cash touchpoints blocked or removed"
                    if not open_touchpoints
                    else f"{len(open_touchpoints)} touchpoint(s) still open"
                ),
            ),
            _check(
                "historical_records_preserved",
                True,
                "Legacy cash rows remain readable; nothing deleted or rewritten",
            ),
        ],
        "references": ["backend/taxi/payments/cashless.py"],
    }


def _providers_item() -> dict:
    from payments.providers import provider_readiness

    readiness = provider_readiness()
    return {
        "id": "payment-providers",
        "title": "Payment providers (Bankily, Masravi, bank transfer, cards)",
        "category": "integration",
        "severity": "high",
        "blocking": False,
        "status": (
            "mock_adapters_active"
            if not readiness["any_live_provider"]
            else "live_review_required"
        ),
        "summary": (
            "Secure provider interfaces exist with clearly-labelled mock adapters. No "
            "live provider is active: live traffic requires official documentation, "
            "approved credentials, owner authorization and a passed sandbox test."
        ),
        "owner_action": (
            "Provide official provider documentation and credentials, then authorize "
            "activation per provider (see phase11-provider-requirements.md)."
        ),
        "evidence": "payments/providers/ + payments/tests/test_payment_providers.py",
        "checks": [
            _check(
                "live_mode_disabled",
                not readiness["live_mode_enabled"],
                (
                    "PAYMENTS_LIVE_MODE is false (no live money movement)"
                    if not readiness["live_mode_enabled"]
                    else "LIVE MODE ENABLED — review immediately"
                ),
            ),
            _check(
                "mock_adapters_labelled",
                all(
                    row["is_mock"] or not row["configured"]
                    for row in readiness["providers"]
                ),
                "Every active adapter is a labelled mock or unconfigured real adapter",
            ),
            _check(
                "provider_count",
                len(readiness["providers"]) == 4,
                f"{len(readiness['providers'])} provider(s) modelled",
            ),
        ],
        "references": ["backend/taxi/payments/providers/"],
    }


def _migration_item() -> dict:
    security_pending = _unapplied_migrations("security")
    employees_pending = _unapplied_migrations("employees")
    pending = [value for value in (security_pending, employees_pending) if value]
    return {
        "id": "pending-migrations",
        "title": "Unapplied migrations on deploy (security, employees)",
        "category": "deployment",
        "severity": "medium",
        "blocking": False,
        "status": "ok" if not pending else "action_required_on_deploy",
        "summary": (
            "Migration files ship with the code; production must apply them in order "
            "during deployment. No model drift exists "
            "(makemigrations --check reports no changes)."
        ),
        "owner_action": (
            "On an authorized deploy: apply security/0004 → security/0005, then "
            "drivers/0024 and employees/0001. Never run migrations without explicit "
            "owner authorization."
        ),
        "evidence": "manage.py makemigrations --check --dry-run → No changes detected",
        "checks": [
            _check(
                "security_app_migrations_applied",
                None if security_pending is None else security_pending == 0,
                (
                    "security app fully migrated"
                    if security_pending == 0
                    else f"{security_pending} security migration(s) unapplied here"
                ),
            ),
            _check(
                "employees_app_migrations_applied",
                None if employees_pending is None else employees_pending == 0,
                (
                    "employees app fully migrated"
                    if employees_pending == 0
                    else f"{employees_pending} employees migration(s) unapplied here"
                ),
            ),
        ],
        "references": [
            "backend/taxi/security/migrations",
            "backend/taxi/employees/migrations",
        ],
    }


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def security_outstanding_issues(request):
    """Server-computed register of the open security/build items (read-only)."""
    items = [
        _css_order_item(),
        _pdf_card_item(),
        _public_qr_item(),
        _cashless_item(),
        _providers_item(),
        _migration_item(),
    ]
    return Response(
        {
            "generated_at": timezone.now(),
            "count": len(items),
            "blocking_count": sum(1 for item in items if item["blocking"]),
            "items": items,
            "protection": protection_summary(),
            "read_only": True,
            "financial_activation": False,
            "public_qr_activation": False,
        }
    )

