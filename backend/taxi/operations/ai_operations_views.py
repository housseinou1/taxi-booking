"""AI Operations & Smart Dispatch API views."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .ai_operations_service import (
    build_ai_operations_dashboard,
    build_driver_performance_scores,
    build_financial_insights,
    build_fleet_health,
    build_hotspot_map,
    build_predictive_alerts,
    build_smart_dispatch_insights,
    build_surge_monitor,
    generate_ai_recommendations,
    list_recommendations,
)
from .executive_permissions import IsExecutiveStaff, can_ceo_actions, can_dispatch_operations
from .models import AIRecommendation

VALID_HOTSPOT_PERIODS = {"hour", "today", "week"}


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _permissions_payload(user):
    return {
        "view": True,
        "dispatch": can_dispatch_operations(user),
        "ceo_actions": can_ceo_actions(user),
    }


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_operations_dashboard(request):
    city = _city_id(request)
    payload = build_ai_operations_dashboard(city)
    payload["permissions"] = _permissions_payload(request.user)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_smart_dispatch(request):
    ride_id = request.query_params.get("ride_id")
    return Response(
        build_smart_dispatch_insights(
            ride_id=int(ride_id) if ride_id else None,
            city_id=_city_id(request),
        )
    )


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_surge_monitor(request):
    return Response(build_surge_monitor(_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_hotspot_map(request):
    period = request.query_params.get("period", "hour")
    if period not in VALID_HOTSPOT_PERIODS:
        period = "hour"
    return Response(build_hotspot_map(period, _city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_predictive_alerts(request):
    return Response({"alerts": build_predictive_alerts()})


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_driver_performance(request):
    return Response(build_driver_performance_scores())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_fleet_health(request):
    return Response(build_fleet_health())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_recommendations_list(request):
    status_filter = request.query_params.get("status")
    return Response({"recommendations": list_recommendations(status_filter)})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def ai_recommendations_refresh(request):
    if not can_ceo_actions(request.user) and not can_dispatch_operations(request.user):
        return Response({"error": "Operations permission required."}, status=403)
    created = generate_ai_recommendations()
    log_from_request(
        request,
        action="admin_action",
        entity_type="ai_recommendation",
        entity_id="refresh",
        summary=f"Generated {len(created)} AI recommendations",
        details={"count": len(created)},
    )
    return Response(
        {
            "generated": len(created),
            "recommendations": list_recommendations(status="pending"),
        }
    )


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def ai_recommendation_action(request, recommendation_id):
    if not can_ceo_actions(request.user):
        return Response({"error": "CEO approval required for recommendation actions."}, status=403)

    rec = get_object_or_404(AIRecommendation, id=recommendation_id)
    action = (request.data.get("action") or "").strip().lower()
    if action not in {"approve", "dismiss", "complete"}:
        return Response({"error": "Invalid action. Use approve, dismiss, or complete."}, status=400)

    status_map = {
        "approve": "approved",
        "dismiss": "dismissed",
        "complete": "completed",
    }
    rec.status = status_map[action]
    rec.reviewed_by = request.user
    rec.reviewed_at = timezone.now()
    rec.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="ai_recommendation",
        entity_id=str(rec.id),
        summary=f"AI recommendation {action}: {rec.title}",
        details={
            "action": action,
            "category": rec.category,
            "explanation": rec.explanation,
            "note": "Human approval only — no automatic enforcement applied.",
        },
    )
    return Response(
        {
            "message": f"Recommendation {action}d.",
            "recommendation_id": rec.id,
            "status": rec.status,
        }
    )


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def ai_financial_insights(request):
    return Response(build_financial_insights())
