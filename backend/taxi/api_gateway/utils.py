"""Phase 38 — API Gateway utilities."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta

import requests
from django.utils import timezone

from security.services.audit_service import log_from_request

from .models import WebhookSubscription


def dispatch_webhook_event_sync(event_type: str, payload: dict, app_id: int | None = None, request=None):
    """Send a signed webhook POST to all active subscriptions for the event."""
    subscriptions = WebhookSubscription.objects.filter(active=True)
    if app_id:
        subscriptions = subscriptions.filter(application_id=app_id)
    subscriptions = [sub for sub in subscriptions if event_type in (sub.events or [])]

    body_payload = {
        "event_type": event_type,
        "timestamp": timezone.now().isoformat(),
        "data": payload,
    }
    body_bytes = json.dumps(body_payload, default=str).encode("utf-8")

    results = []
    for sub in subscriptions:
        signature = "sha256=" + hmac.new(
            sub.secret.encode(), body_bytes, hashlib.sha256
        ).hexdigest()
        try:
            response = requests.post(
                sub.url,
                data=body_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": signature,
                    "X-Webhook-Event": event_type,
                },
                timeout=10,
            )
            results.append({"subscription": sub.id, "status": response.status_code})
        except Exception as exc:
            results.append({"subscription": sub.id, "status": None, "error": str(exc)})

    if request:
        log_from_request(
            request,
            action="webhook_dispatch",
            entity_type="webhook",
            entity_id=event_type,
            summary=f"Dispatched {event_type} webhooks",
            details={"count": len(results), "results": results},
        )
    return results


def dispatch_webhook_event(event_type: str, payload: dict, app_id: int | None = None, request=None):
    """Backward-compatible alias used by admin trigger views."""
    return dispatch_webhook_event_sync(event_type, payload, app_id=app_id, request=request)


def _percentile(values: list[int], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int(round((pct / 100) * (len(ordered) - 1)))
    return float(ordered[index])


def build_gateway_analytics(*, days: int = 30) -> dict:
    from django.db.models import Avg, Count

    from .models import APIGatewayLog, PartnerApplication, PartnerOrganization

    since = timezone.now() - timedelta(days=days)
    logs = APIGatewayLog.objects.filter(created_at__gte=since)
    total = logs.count()
    success = logs.filter(status_code__gte=200, status_code__lt=300).count()
    errors_4xx = logs.filter(status_code__gte=400, status_code__lt=500).count()
    errors_5xx = logs.filter(status_code__gte=500).count()
    errors = errors_4xx + errors_5xx

    latencies = list(
        logs.exclude(response_time_ms__isnull=True).values_list("response_time_ms", flat=True)[:5000]
    )

    top_paths = (
        logs.values("path")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    top_consumers = (
        logs.exclude(application__isnull=True)
        .values("application__name", "application__organization__name")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )

    avg_latency = logs.aggregate(a=Avg("response_time_ms"))["a"]

    return {
        "generated_at": timezone.now().isoformat(),
        "period_days": days,
        "total_integrations": PartnerOrganization.objects.filter(status="approved").count(),
        "active_applications": PartnerApplication.objects.filter(status="active").count(),
        "total_calls": total,
        "success_count": success,
        "error_count": errors,
        "errors_4xx": errors_4xx,
        "errors_5xx": errors_5xx,
        "success_rate_pct": round(success / max(total, 1) * 100, 1),
        "error_rate_pct": round(errors / max(total, 1) * 100, 1),
        "avg_latency_ms": round(float(avg_latency or 0), 1),
        "latency_p95_ms": round(_percentile(latencies, 95), 1),
        "latency_p99_ms": round(_percentile(latencies, 99), 1),
        "top_paths": list(top_paths),
        "top_consumers": list(top_consumers),
    }


def build_gateway_ceo_dashboard(*, days: int = 30) -> dict:
    from django.db import models as django_models
    from django.db.models import Count

    from .models import PartnerApplication, PartnerOrganization

    analytics = build_gateway_analytics(days=days)
    since = timezone.now() - timedelta(days=days)

    partner_activity = (
        PartnerOrganization.objects.filter(status="approved")
        .annotate(
            application_count=Count("applications", distinct=True),
            recent_calls=Count(
                "applications__logs",
                filter=django_models.Q(applications__logs__created_at__gte=since),
                distinct=True,
            ),
        )
        .order_by("-recent_calls")[:10]
    )

    top_integrators = [
        {
            "organization": org.name,
            "applications": org.application_count,
            "recent_api_calls": org.recent_calls,
            "status": org.status,
        }
        for org in partner_activity
    ]

    active_keys = PartnerApplication.objects.filter(status="active").aggregate(
        keys=Count("api_keys", filter=django_models.Q(api_keys__revoked=False))
    )["keys"]

    return {
        "generated_at": timezone.now().isoformat(),
        "period_days": days,
        "total_integrations": analytics["total_integrations"],
        "active_applications": analytics["active_applications"],
        "active_api_keys": active_keys or 0,
        "api_revenue_mru": None,
        "platform_usage": {
            "total_calls": analytics["total_calls"],
            "success_rate_pct": analytics["success_rate_pct"],
            "avg_latency_ms": analytics["avg_latency_ms"],
            "latency_p95_ms": analytics["latency_p95_ms"],
        },
        "partner_activity": top_integrators,
        "top_integrators": analytics["top_consumers"],
        "errors_4xx": analytics["errors_4xx"],
        "errors_5xx": analytics["errors_5xx"],
    }
