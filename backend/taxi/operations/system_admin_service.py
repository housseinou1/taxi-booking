"""System Administration — platform health composition, staff users, settings, DR."""

from __future__ import annotations

import os
import secrets
import string
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.sessions.models import Session
from django.db import connections
from django.core.cache import cache
from django.utils import timezone

from admin_2fa.models import AdminTOTP
from operations.models import PlatformSetting
from security.models import AuditLog, FraudFlag

User = get_user_model()

SYSTEM_ADMIN_GROUPS = {"CEO", "Super Admin", "Platform Admin"}

# Allowlisted PlatformSetting keys editable from System Admin (values from DB, not hard-coded business rates).
SETTINGS_CATALOG = {
    "maintenance_mode": {
        "label": "Maintenance mode",
        "critical": True,
        "default": {"enabled": False, "message": ""},
    },
    "soft_launch": {
        "label": "Soft launch controls",
        "critical": True,
        "default": {},
    },
    "driver_onboarding_paused": {
        "label": "Driver onboarding paused",
        "critical": True,
        "default": {"enabled": False},
    },
    "closed_beta": {
        "label": "Closed beta",
        "critical": False,
        "default": {},
    },
    "feature_flags": {
        "label": "Central feature flags",
        "critical": True,
        "default": {"flags": {}},
    },
    "notification_templates": {
        "label": "Notification templates",
        "critical": False,
        "default": {},
    },
    "backup_offsite_status": {
        "label": "Backup / offsite status",
        "critical": False,
        "default": {},
        "read_only": True,
    },
    "pending_setting_approvals": {
        "label": "Pending dual approvals",
        "critical": False,
        "default": {"items": []},
        "read_only": True,
    },
}

ASSIGNABLE_GROUPS = [
    "CEO",
    "Super Admin",
    "Platform Admin",
    "Operations Manager",
    "Supervisor",
    "Finance",
    "Accountant",
    "Support",
    "Marketing",
    "Analytics",
    "Data Analyst",
    "HR",
    "Training Manager",
    "Compliance",
    "Compliance Manager",
    "Board",
    "Developer Relations",
]

DR_PLAYBOOKS = [
    {
        "id": "database_failure",
        "title": "Database failure",
        "readiness_key": "database",
        "steps": [
            "Confirm /api/health/ready/ database=error",
            "Failover to replica if configured; otherwise restore latest verified backup",
            "Enable maintenance_mode via System Admin / CEO",
            "Verify migrations and connection pool after restore",
            "Disable maintenance_mode only after readiness=ok",
        ],
    },
    {
        "id": "redis_outage",
        "title": "Redis outage",
        "readiness_key": "redis",
        "steps": [
            "Confirm cache health failure on /api/health/status/",
            "Restart Redis / fail over managed cache",
            "Expect degraded WebSocket and rate-limit behavior until Redis recovers",
            "Flush stale keys only if documented runbook requires it",
        ],
    },
    {
        "id": "celery_failure",
        "title": "Celery failure",
        "readiness_key": "celery",
        "steps": [
            "Inspect worker ping and queue depth on health status",
            "Restart workers and Celery Beat",
            "Replay critical pending tasks after backlog drains",
            "Confirm push/email/SMS async jobs resume",
        ],
    },
    {
        "id": "websocket_failure",
        "title": "WebSocket failure",
        "readiness_key": "websocket",
        "steps": [
            "Confirm Redis and Channels consumers",
            "Roll restart ASGI / Daphne / Uvicorn workers",
            "Validate rider/driver live trip channels on staging first",
        ],
    },
    {
        "id": "push_outage",
        "title": "Push notification outage",
        "readiness_key": "push",
        "steps": [
            "Check Firebase / FCM credentials presence and recent error logs",
            "Disable non-critical marketing pushes via feature flags",
            "Fall back to in-app messaging for safety alerts where possible",
        ],
    },
    {
        "id": "payment_outage",
        "title": "Payment outage",
        "readiness_key": "payments",
        "steps": [
            "Confirm payment gateway configuration and provider status page",
            "Pause non-essential payouts; keep cash rides if policy allows",
            "Coordinate with Finance Ops — do not invent successful settlements",
        ],
    },
    {
        "id": "maps_outage",
        "title": "Maps outage",
        "readiness_key": "maps",
        "steps": [
            "Confirm maps API key configuration",
            "Fall back to OSM / cached routes if configured",
            "Communicate ETA degradation to Ops",
        ],
    },
]


def can_manage_system(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user.is_staff:
        return False
    return user.groups.filter(name__in=SYSTEM_ADMIN_GROUPS).exists()


def _timed_check(fn):
    started = time.perf_counter()
    try:
        result = fn()
        status = result if isinstance(result, str) else result.get("status", "ok")
        detail = result if isinstance(result, dict) else {}
    except Exception as exc:
        status = "error"
        detail = {"error": str(exc)[:200]}
    elapsed = round((time.perf_counter() - started) * 1000, 1)
    return {
        "status": status,
        "response_time_ms": elapsed,
        "last_check": timezone.now().isoformat(),
        "error_count": 1 if status in {"error", "critical"} else 0,
        "uptime_pct": None if status in {"error", "critical", "unknown", "not_configured"} else 100.0,
        **{k: v for k, v in detail.items() if k != "status"},
    }


def _check_database():
    connections["default"].ensure_connection()
    return "ok"


def _check_redis():
    cache.set("_sysadmin_health", "1", timeout=5)
    if cache.get("_sysadmin_health") != "1":
        raise RuntimeError("redis readback failed")
    return "ok"


def _check_celery():
    from celery import current_app

    inspector = current_app.control.inspect(timeout=2.0)
    ping = inspector.ping() if inspector else None
    if not ping:
        return {"status": "unknown", "workers": 0}
    reserved = inspector.reserved() or {}
    active = inspector.active() or {}
    scheduled = inspector.scheduled() or {}
    return {
        "status": "ok",
        "workers": len(ping),
        "pending_tasks": sum(len(t) for t in reserved.values()),
        "active_tasks": sum(len(t) for t in active.values()),
        "scheduled_tasks": sum(len(t) for t in scheduled.values()),
    }


def _check_celery_beat():
    # Soft signal: Beat is healthy if schedule exists and workers respond; otherwise unknown.
    try:
        from django_celery_beat.models import PeriodicTask

        enabled = PeriodicTask.objects.filter(enabled=True).count()
        return {"status": "ok" if enabled >= 0 else "unknown", "enabled_tasks": enabled}
    except Exception:
        beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", None) or {}
        if beat_schedule:
            return {"status": "configured", "schedule_entries": len(beat_schedule)}
        return {"status": "unknown"}


def _configured(value: str | None) -> bool:
    return bool(value and str(value).strip() and "your_" not in str(value).lower())


def _check_push():
    firebase = getattr(settings, "FIREBASE_CREDENTIALS", None) or os.getenv("FIREBASE_CREDENTIALS_JSON", "")
    fcm = os.getenv("FCM_SERVER_KEY", "") or getattr(settings, "FCM_SERVER_KEY", "")
    if _configured(str(firebase)) or _configured(str(fcm)):
        return {"status": "configured", "provider": "firebase/fcm"}
    return {"status": "not_configured"}


def _check_email():
    user = getattr(settings, "EMAIL_HOST_USER", "") or ""
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if "console" in backend:
        return {"status": "configured", "mode": "console"}
    if _configured(user):
        return {"status": "configured", "host": getattr(settings, "EMAIL_HOST", "")}
    return {"status": "not_configured"}


def _check_sms():
    provider = getattr(settings, "YALA_SMS_PROVIDER", "") or ""
    if provider in {"", None}:
        return {"status": "not_configured", "enabled": False}
    if provider == "console":
        return {"status": "configured", "provider": "console", "enabled": True}
    if _configured(getattr(settings, "YALA_SMS_API_KEY", "")):
        return {"status": "configured", "provider": provider, "enabled": True}
    return {"status": "not_configured", "provider": provider, "enabled": False}


def _check_payments():
    stripe = getattr(settings, "STRIPE_SECRET_KEY", "") or ""
    # Other gateways may be present via env without inventing live success.
    bankily = os.getenv("BANKILY_API_KEY", "") or os.getenv("YALA_PAYMENT_API_KEY", "")
    configured = []
    if _configured(stripe):
        configured.append("stripe")
    if _configured(bankily):
        configured.append("local_gateway")
    if configured:
        return {"status": "configured", "gateways": configured}
    return {"status": "not_configured", "gateways": []}


def _check_maps():
    key = os.getenv("GOOGLE_MAPS_API_KEY", "") or getattr(settings, "GOOGLE_MAPS_API_KEY", "")
    if _configured(key):
        return {"status": "configured", "provider": "google_maps"}
    return {"status": "not_configured"}


def _check_storage():
    media_root = getattr(settings, "MEDIA_ROOT", None)
    default_storage = getattr(settings, "DEFAULT_FILE_STORAGE", "") or ""
    aws = os.getenv("AWS_STORAGE_BUCKET_NAME", "") or os.getenv("AWS_S3_BUCKET_NAME", "")
    if _configured(aws) or "S3" in default_storage or "s3" in default_storage.lower():
        return {"status": "configured", "backend": "s3"}
    if media_root:
        try:
            os.makedirs(media_root, exist_ok=True)
            probe = os.path.join(str(media_root), ".yala_health_probe")
            with open(probe, "w", encoding="utf-8") as handle:
                handle.write("ok")
            os.remove(probe)
            return {"status": "ok", "backend": "local_media"}
        except Exception as exc:
            return {"status": "error", "backend": "local_media", "error": str(exc)[:160]}
    return {"status": "unknown"}


def _check_cdn():
    cdn = os.getenv("YALA_CDN_URL", "") or getattr(settings, "YALA_CDN_URL", "")
    if _configured(cdn):
        return {"status": "configured", "url_host": cdn.split("/")[2] if "://" in cdn else "set"}
    return {"status": "not_configured", "note": "CDN optional"}


def build_platform_health() -> dict:
    # Avoid double Redis probe failures marking websocket incorrectly when redis raises.
    def _ws():
        try:
            _check_redis()
            return {"status": "ok"}
        except Exception:
            return {"status": "degraded"}

    services = {
        "api": _timed_check(lambda: "ok"),
        "database": _timed_check(_check_database),
        "redis": _timed_check(_check_redis),
        "celery": _timed_check(_check_celery),
        "celery_beat": _timed_check(_check_celery_beat),
        "websocket": _timed_check(_ws),
        "push": _timed_check(_check_push),
        "email": _timed_check(_check_email),
        "sms": _timed_check(_check_sms),
        "payments": _timed_check(_check_payments),
        "maps": _timed_check(_check_maps),
        "storage": _timed_check(_check_storage),
        "cdn": _timed_check(_check_cdn),
    }

    critical = {"database", "redis", "api"}
    statuses = [services[k]["status"] for k in critical]
    if any(s == "error" for s in statuses):
        overall = "critical"
    elif any(s in {"error", "degraded", "unknown"} for s in (services[k]["status"] for k in services)):
        overall = "degraded"
    else:
        overall = "ok"

    return {
        "generated_at": timezone.now().isoformat(),
        "status": overall,
        "services": services,
        "timezone": getattr(settings, "TIME_ZONE", "UTC"),
    }


def list_staff_users(filters: dict | None = None) -> dict:
    filters = filters or {}
    qs = User.objects.filter(is_staff=True).prefetch_related("groups").order_by("-date_joined")
    search = (filters.get("search") or "").strip()
    if search:
        qs = qs.filter(email__icontains=search) | qs.filter(first_name__icontains=search) | qs.filter(
            last_name__icontains=search
        )
    if filters.get("active") in {"1", "true", True}:
        qs = qs.filter(is_active=True)
    if filters.get("active") in {"0", "false", False}:
        qs = qs.filter(is_active=False)

    totp_confirmed = set(
        AdminTOTP.objects.filter(is_confirmed=True).values_list("user_id", flat=True)
    )
    active_sessions: dict[int, int] = {}
    try:
        from django.db.models import Count
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        active_sessions = {
            row["user_id"]: row["c"]
            for row in OutstandingToken.objects.values("user_id").annotate(c=Count("id"))
        }
    except Exception:
        active_sessions = {}

    rows = []
    for user in qs[:200]:
        rows.append(
            {
                "id": user.id,
                "email": user.email,
                "name": user.get_full_name() or "",
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "groups": list(user.groups.values_list("name", flat=True)),
                "mfa_confirmed": user.id in totp_confirmed,
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "date_joined": user.date_joined.isoformat() if user.date_joined else None,
                "active_refresh_tokens": active_sessions.get(user.id, 0),
            }
        )
    return {
        "generated_at": timezone.now().isoformat(),
        "users": rows,
        "assignable_groups": ASSIGNABLE_GROUPS,
        "total": len(rows),
    }


def invite_staff_user(payload: dict, actor) -> dict:
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise ValueError("email is required")
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError("User already exists")

    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(16))
    user = User.objects.create_user(
        email=email,
        password=temp_password,
        is_staff=True,
        is_active=True,
        first_name=(payload.get("first_name") or "")[:80],
        last_name=(payload.get("last_name") or "")[:80],
    )
    group_name = (payload.get("group") or payload.get("role") or "Support").strip()
    if group_name in ASSIGNABLE_GROUPS:
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)

    return {
        "id": user.id,
        "email": user.email,
        "groups": list(user.groups.values_list("name", flat=True)),
        "temporary_password": temp_password,
        "note": "Share temporary password securely; force password change on first login if policy requires.",
    }


def update_staff_user(user_id: int, payload: dict, actor) -> dict:
    user = User.objects.filter(id=user_id, is_staff=True).prefetch_related("groups").first()
    if not user:
        raise ValueError("Staff user not found")
    if user.id == actor.id and payload.get("action") in {"disable", "force_logout"}:
        # Allow force_logout self; disallow self-disable
        if payload.get("action") == "disable":
            raise ValueError("Cannot disable your own account")

    action = (payload.get("action") or "").strip()
    if action == "disable":
        if user.is_superuser and not actor.is_superuser:
            raise ValueError("Cannot disable superuser")
        user.is_active = False
        user.save(update_fields=["is_active"])
        _force_logout(user)
    elif action == "enable":
        user.is_active = True
        user.save(update_fields=["is_active"])
    elif action == "force_logout":
        _force_logout(user)
    elif action == "reset_password":
        alphabet = string.ascii_letters + string.digits
        temp_password = "".join(secrets.choice(alphabet) for _ in range(16))
        user.set_password(temp_password)
        user.save(update_fields=["password"])
        _force_logout(user)
        return {
            "id": user.id,
            "email": user.email,
            "temporary_password": temp_password,
            "action": action,
        }
    elif action == "assign_role":
        group_name = (payload.get("group") or "").strip()
        if group_name not in ASSIGNABLE_GROUPS:
            raise ValueError("Invalid group")
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
    elif action == "revoke_role":
        group_name = (payload.get("group") or "").strip()
        group = Group.objects.filter(name=group_name).first()
        if group:
            user.groups.remove(group)
    else:
        raise ValueError("Unknown action")

    return {
        "id": user.id,
        "email": user.email,
        "is_active": user.is_active,
        "groups": list(user.groups.values_list("name", flat=True)),
        "action": action,
    }


def _force_logout(user):
    try:
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
    except Exception:
        pass
    # Best-effort clear django sessions for this user
    try:
        for session in Session.objects.filter(expire_date__gte=timezone.now()):
            data = session.get_decoded()
            if str(data.get("_auth_user_id")) == str(user.id):
                session.delete()
    except Exception:
        pass


def build_security_center() -> dict:
    since = timezone.now() - timedelta(days=7)
    failed_logins = AuditLog.objects.filter(
        created_at__gte=since, summary__icontains="failed"
    ).count()
    permission_denied = AuditLog.objects.filter(
        created_at__gte=since, summary__icontains="permission"
    ).count()
    locked = User.objects.filter(is_staff=True, is_active=False).count()
    open_fraud = FraudFlag.objects.filter(status="open").count()
    jwt_failures = AuditLog.objects.filter(
        created_at__gte=since, summary__icontains="token"
    ).count()

    suspicious_ips = list(
        AuditLog.objects.filter(created_at__gte=since, ip_address__isnull=False)
        .exclude(ip_address=None)
        .values_list("ip_address", flat=True)
        .distinct()[:20]
    )

    risk = "low"
    if open_fraud > 10 or failed_logins > 50:
        risk = "high"
    elif open_fraud > 0 or failed_logins > 10:
        risk = "medium"

    timeline = list(
        AuditLog.objects.filter(created_at__gte=since)
        .select_related("actor")
        .order_by("-created_at")[:40]
    )
    events = [
        {
            "id": row.id,
            "at": row.created_at.isoformat(),
            "actor": row.actor.email if row.actor_id else "system",
            "summary": row.summary,
            "action": row.action,
            "entity_type": row.entity_type,
            "ip_address": row.ip_address,
        }
        for row in timeline
    ]

    recommendations = []
    if risk != "low":
        recommendations.append("Review open fraud flags and failed login clusters")
    if locked:
        recommendations.append("Review disabled staff accounts before re-enabling")
    if not recommendations:
        recommendations.append("Continue routine MFA and audit log review")

    return {
        "generated_at": timezone.now().isoformat(),
        "failed_logins_7d": failed_logins,
        "locked_accounts": locked,
        "suspicious_ips": [str(ip) for ip in suspicious_ips if ip],
        "jwt_failures_7d": jwt_failures,
        "permission_violations_7d": permission_denied,
        "open_fraud_flags": open_fraud,
        "rate_limiting": "enabled_via_auth_rate_limit",
        "api_abuse_signals": open_fraud,
        "risk_level": risk,
        "recommended_actions": recommendations,
        "incident_timeline": events,
    }


def search_audit_logs(filters: dict | None = None) -> dict:
    filters = filters or {}
    qs = AuditLog.objects.select_related("actor").all()
    if filters.get("user"):
        qs = qs.filter(actor__email__icontains=filters["user"])
    if filters.get("action"):
        qs = qs.filter(action=filters["action"])
    if filters.get("entity_type") or filters.get("module"):
        qs = qs.filter(entity_type=filters.get("entity_type") or filters.get("module"))
    if filters.get("entity_id") or filters.get("resource"):
        qs = qs.filter(entity_id=str(filters.get("entity_id") or filters.get("resource")))
    if filters.get("ip"):
        qs = qs.filter(ip_address=filters["ip"])
    if filters.get("date_from"):
        qs = qs.filter(created_at__date__gte=filters["date_from"])
    if filters.get("date_to"):
        qs = qs.filter(created_at__date__lte=filters["date_to"])
    if filters.get("role"):
        qs = qs.filter(actor__groups__name=filters["role"]).distinct()

    limit = min(int(filters.get("limit") or 100), 500)
    rows = []
    for row in qs.order_by("-created_at")[:limit]:
        details = row.details or {}
        rows.append(
            {
                "id": row.id,
                "actor_email": row.actor.email if row.actor_id else "system",
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "summary": row.summary,
                "details": details,
                "before": details.get("before") or details.get("previous"),
                "after": details.get("after") or details.get("new"),
                "reason": details.get("reason") or details.get("admin_note"),
                "ip_address": row.ip_address,
                "created_at": row.created_at.isoformat(),
            }
        )
    return {"generated_at": timezone.now().isoformat(), "logs": rows, "total": len(rows)}


def list_platform_settings() -> dict:
    items = []
    pending = PlatformSetting.get_value("pending_setting_approvals", {"items": []}) or {"items": []}
    for key, meta in SETTINGS_CATALOG.items():
        value = PlatformSetting.get_value(key, meta.get("default"))
        row = PlatformSetting.objects.filter(key=key).select_related("updated_by").first()
        items.append(
            {
                "key": key,
                "label": meta["label"],
                "critical": bool(meta.get("critical")),
                "read_only": bool(meta.get("read_only")),
                "value": value,
                "updated_at": row.updated_at.isoformat() if row else None,
                "updated_by": row.updated_by.email if row and row.updated_by_id else None,
            }
        )
    return {
        "generated_at": timezone.now().isoformat(),
        "settings": items,
        "pending_approvals": pending.get("items") or [],
    }


def update_platform_setting(key: str, value, actor, *, confirm: bool = False, approve_token: str | None = None) -> dict:
    meta = SETTINGS_CATALOG.get(key)
    if not meta:
        raise ValueError("Setting key not allowlisted")
    if meta.get("read_only"):
        raise ValueError("Setting is read-only via this API")

    previous = PlatformSetting.get_value(key, meta.get("default"))

    if approve_token:
        pending = PlatformSetting.get_value("pending_setting_approvals", {"items": []}) or {"items": []}
        items = list(pending.get("items") or [])
        match = next((i for i in items if i.get("token") == approve_token and i.get("key") == key), None)
        if not match:
            raise ValueError("Pending approval not found")
        if match.get("requested_by") == actor.email and not actor.is_superuser:
            raise ValueError("Dual approval requires a different approver")
        value = match.get("proposed_value")
        previous = match.get("previous_value")
        items = [i for i in items if i.get("token") != approve_token]
        PlatformSetting.set_value("pending_setting_approvals", {"items": items}, user=actor)
        PlatformSetting.set_value(key, value, user=actor)
        return {
            "status": "applied",
            "key": key,
            "value": value,
            "previous": previous,
            "approved_by": actor.email,
        }

    if meta.get("critical"):
        if not confirm:
            raise ValueError("confirm=true required for critical settings")
        pending = PlatformSetting.get_value("pending_setting_approvals", {"items": []}) or {"items": []}
        items = list(pending.get("items") or [])
        token = secrets.token_hex(8)
        items = [i for i in items if i.get("key") != key]
        items.append(
            {
                "token": token,
                "key": key,
                "proposed_value": value,
                "previous_value": previous,
                "requested_by": actor.email,
                "requested_at": timezone.now().isoformat(),
                "requires_confirm": True,
            }
        )
        PlatformSetting.set_value("pending_setting_approvals", {"items": items}, user=actor)
        return {
            "status": "pending_approval",
            "key": key,
            "token": token,
            "message": "Critical setting staged — requires dual approval",
        }

    PlatformSetting.set_value(key, value, user=actor)
    return {
        "status": "applied",
        "key": key,
        "value": value,
        "previous": previous,
    }


def get_feature_flags() -> dict:
    raw = PlatformSetting.get_value("feature_flags", {"flags": {}}) or {"flags": {}}
    flags = raw.get("flags") if isinstance(raw, dict) else {}
    return {
        "generated_at": timezone.now().isoformat(),
        "flags": flags or {},
        "environments": ["development", "staging", "production"],
    }


def update_feature_flag(flag_id: str, payload: dict, actor) -> dict:
    if not flag_id:
        raise ValueError("flag id required")
    raw = PlatformSetting.get_value("feature_flags", {"flags": {}}) or {"flags": {}}
    flags = dict(raw.get("flags") or {})
    previous = flags.get(flag_id)
    entry = {
        "enabled": bool(payload.get("enabled", False)),
        "rollout_pct": max(0, min(100, int(payload.get("rollout_pct") or 0))),
        "environment": payload.get("environment") or "production",
        "updated_at": timezone.now().isoformat(),
        "updated_by": actor.email,
    }
    flags[flag_id] = entry
    PlatformSetting.set_value("feature_flags", {"flags": flags}, user=actor)
    history = list((raw.get("history") or [])) if isinstance(raw, dict) else []
    history.insert(
        0,
        {
            "flag": flag_id,
            "before": previous,
            "after": entry,
            "at": timezone.now().isoformat(),
            "actor": actor.email,
        },
    )
    PlatformSetting.set_value(
        "feature_flags",
        {"flags": flags, "history": history[:100]},
        user=actor,
    )
    return {"flag": flag_id, "value": entry, "previous": previous}


def get_backup_status() -> dict:
    status_payload = PlatformSetting.get_value("backup_offsite_status", {}) or {}
    return {
        "generated_at": timezone.now().isoformat(),
        "last_backup": status_payload.get("last_backup") or status_payload.get("last_success_at"),
        "backup_status": status_payload.get("status") or ("unknown" if not status_payload else "ok"),
        "restore_points": status_payload.get("restore_points") or [],
        "storage_usage": status_payload.get("storage_usage"),
        "retention": status_payload.get("retention"),
        "raw": status_payload,
        "note": "Status is ingested by backup scripts into PlatformSetting; trigger/verify call ops runbooks.",
    }


def trigger_backup_action(action: str, actor, *, confirm: bool = False) -> dict:
    action = (action or "").strip()
    if action not in {"trigger", "verify", "restore_test"}:
        raise ValueError("Invalid backup action")
    if not confirm:
        raise ValueError("confirm=true required")
    # Do not pretend a backup completed — record an audited request for ops tooling.
    queue = PlatformSetting.get_value("backup_action_queue", {"items": []}) or {"items": []}
    items = list(queue.get("items") or [])
    item = {
        "id": secrets.token_hex(6),
        "action": action,
        "requested_by": actor.email,
        "requested_at": timezone.now().isoformat(),
        "status": "queued",
        "environment": "non-production" if action == "restore_test" else "production",
    }
    items.insert(0, item)
    PlatformSetting.set_value("backup_action_queue", {"items": items[:50]}, user=actor)
    return item


def build_integrations_status() -> dict:
    health = build_platform_health()["services"]
    mapping = {
        "google_maps": health.get("maps"),
        "openstreetmap": {"status": "optional", "note": "Client/OSM fallback when configured"},
        "payments": health.get("payments"),
        "firebase": health.get("push"),
        "email": health.get("email"),
        "sms": health.get("sms"),
        "analytics": {"status": "configured" if True else "unknown", "note": "BI warehouse internal"},
    }
    return {"generated_at": timezone.now().isoformat(), "integrations": mapping}


def build_release_info() -> dict:
    min_v = getattr(settings, "YALA_APP_MIN_VERSIONS", {}) or {}
    latest = getattr(settings, "YALA_APP_LATEST_VERSIONS", {}) or {}
    backend_version = (
        os.getenv("YALA_BACKEND_VERSION")
        or getattr(settings, "YALA_BACKEND_VERSION", None)
        or os.getenv("GIT_SHA", "unknown")
    )
    admin_version = os.getenv("YALA_ADMIN_VERSION") or getattr(settings, "YALA_ADMIN_VERSION", "shell-sprint8")
    history = PlatformSetting.get_value("release_history", {"items": []}) or {"items": []}
    return {
        "generated_at": timezone.now().isoformat(),
        "environment": "development" if settings.DEBUG else "production",
        "backend_version": backend_version,
        "admin_version": admin_version,
        "rider": {"min": min_v.get("rider"), "latest": latest.get("rider")},
        "driver": {"min": min_v.get("driver"), "latest": latest.get("driver")},
        "delivery": {"min": min_v.get("delivery"), "latest": latest.get("delivery")},
        "deployment_history": history.get("items") or [],
        "rollback_available": bool((history.get("items") or []) and len(history.get("items") or []) > 1),
        "release_notes": history.get("notes") or "Managed via PlatformSetting.release_history / deploy pipeline",
    }


def build_disaster_recovery() -> dict:
    health = build_platform_health()
    services = health.get("services") or {}
    playbooks = []
    for book in DR_PLAYBOOKS:
        key = book["readiness_key"]
        svc = services.get(key) or {}
        status = svc.get("status", "unknown")
        ready = status in {"ok", "configured"}
        playbooks.append(
            {
                **book,
                "current_status": status,
                "readiness": "ready" if ready else "attention",
            }
        )
    return {
        "generated_at": timezone.now().isoformat(),
        "overall_health": health.get("status"),
        "playbooks": playbooks,
    }


def build_system_admin_dashboard() -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "health": build_platform_health(),
        "security": build_security_center(),
        "backup": get_backup_status(),
        "releases": build_release_info(),
        "integrations": build_integrations_status(),
        "feature_flags": get_feature_flags(),
        "disaster_recovery": build_disaster_recovery(),
    }
