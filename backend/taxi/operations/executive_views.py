"""Executive operations dashboard API views."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from notifications.services import send_push_notification
from security.services.audit_service import log_from_request

from .executive_permissions import (
    IsExecutiveStaff,
    can_ceo_actions,
    can_manage_finance,
    can_manage_operations,
)
from .executive_service import (
    build_finance_dashboard,
    build_live_metrics,
    build_map_snapshot,
    build_operations_queues,
    build_qa_reconciliation,
    build_report_rows,
    build_security_panel,
    build_support_panel,
)
from django.contrib.auth import get_user_model

from .models import PlatformSetting
from .report_export import export_csv, export_excel, export_pdf

User = get_user_model()


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_live(request):
    return Response(build_live_metrics(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_finance(request):
    period = request.query_params.get("period", "daily")
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        period = "daily"
    return Response(build_finance_dashboard(period=period, city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_map(request):
    return Response(build_map_snapshot(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_queues(request):
    return Response(build_operations_queues(city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_security(request):
    return Response(build_security_panel())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_support(request):
    return Response(build_support_panel())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_dashboard(request):
    city = _city_id(request)
    period = request.query_params.get("period", "daily")
    maintenance = PlatformSetting.get_value("maintenance_mode", {"enabled": False})
    return Response(
        {
            "live": build_live_metrics(city_id=city),
            "finance": build_finance_dashboard(period=period, city_id=city),
            "map": build_map_snapshot(city_id=city),
            "operations": build_operations_queues(city_id=city),
            "security": build_security_panel(),
            "support": build_support_panel(),
            "qa": build_qa_reconciliation(),
            "maintenance_mode": maintenance,
            "permissions": {
                "finance": can_manage_finance(request.user),
                "operations": can_manage_operations(request.user),
                "ceo_actions": can_ceo_actions(request.user),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_qa(request):
    return Response(build_qa_reconciliation())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def executive_export(request):
    # DRF reserves the `format` query param; use `export_format` instead.
    export_format = (request.query_params.get("export_format") or "csv").lower()
    filters = {
        "date_from": request.query_params.get("date_from"),
        "date_to": request.query_params.get("date_to"),
        "city": request.query_params.get("city"),
        "driver_id": request.query_params.get("driver_id"),
        "courier_id": request.query_params.get("courier_id"),
        "payment_method": request.query_params.get("payment_method"),
    }
    rows = build_report_rows(filters)

    if export_format == "xlsx":
        content = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "yala-executive-report.xlsx"
    elif export_format == "pdf":
        content = export_pdf(rows)
        content_type = "application/pdf"
        filename = "yala-executive-report.pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename = "yala-executive-report.csv"

    if isinstance(content, str):
        content = content.encode("utf-8")

    response = Response(content, content_type=content_type, status=status.HTTP_200_OK)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def executive_broadcast(request):
    if not can_ceo_actions(request.user):
        return Response({"error": "CEO permission required."}, status=status.HTTP_403_FORBIDDEN)

    title = (request.data.get("title") or "Yala Announcement").strip()
    body = (request.data.get("message") or request.data.get("body") or "").strip()
    audience = (request.data.get("audience") or "drivers").strip().lower()
    if not body:
        return Response({"error": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

    from django.contrib.auth import get_user_model

    User = get_user_model()
    if audience == "all":
        users = User.objects.filter(is_active=True)
    elif audience == "riders":
        users = User.objects.filter(is_active=True, user_type="rider")
    elif audience == "couriers":
        users = User.objects.filter(is_active=True, user_type="driver")
    else:
        users = User.objects.filter(is_active=True, user_type="driver")

    sent = 0
    for user in users[:500]:
        try:
            send_push_notification(user, title, body, data={"type": "executive_broadcast"})
            sent += 1
        except Exception:
            continue

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="broadcast",
        summary=f"Executive broadcast to {audience}",
        details={"title": title, "sent": sent},
    )
    return Response({"message": "Broadcast queued", "sent": sent})


@api_view(["GET", "POST"])
@permission_classes([IsExecutiveStaff])
def executive_maintenance_mode(request):
    if request.method == "GET":
        return Response(PlatformSetting.get_value("maintenance_mode", {"enabled": False}))

    if not can_ceo_actions(request.user):
        return Response({"error": "CEO permission required."}, status=status.HTTP_403_FORBIDDEN)

    enabled = bool(request.data.get("enabled", False))
    message = (request.data.get("message") or "").strip()
    payload = {"enabled": enabled, "message": message}
    PlatformSetting.set_value("maintenance_mode", payload, user=request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="maintenance_mode",
        summary=f"Maintenance mode {'enabled' if enabled else 'disabled'}",
        details=payload,
    )
    return Response({"maintenance_mode": payload})


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def executive_account_action(request):
    if not can_ceo_actions(request.user):
        return Response({"error": "CEO permission required."}, status=status.HTTP_403_FORBIDDEN)

    email = (request.data.get("email") or "").strip().lower()
    action = (request.data.get("action") or "").strip().lower()
    if not email:
        return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
    if action not in {"suspend", "block", "reactivate"}:
        return Response({"error": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
    if user.is_staff or user.is_superuser:
        return Response({"error": "Cannot modify staff accounts."}, status=status.HTTP_403_FORBIDDEN)

    if action in {"suspend", "block"}:
        user.is_active = False
        user.save(update_fields=["is_active"])
    elif action == "reactivate":
        user.is_active = True
        user.save(update_fields=["is_active"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=f"user:{user.id}",
        summary=f"Account {action}d by executive",
        details={"action": action, "email": email},
    )
    return Response({"message": f"Account {action}d.", "user_id": user.id})
