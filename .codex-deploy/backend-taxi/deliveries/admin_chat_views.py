"""Admin delivery chat moderation and review APIs."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from security.services.audit_service import log_from_request
from taxi.drivers.models import DriverProfile

from .models import Delivery, DeliveryChatReport, DeliveryDispute, DeliveryMessage, DriverDeliverySettings
from .services.chat_privacy import admin_can_view_chat, get_chat_case_reasons


def _image_url(msg, request):
    if not msg.image:
        return None
    return request.build_absolute_uri(msg.image.url) if request else msg.image.url


def _serialize_admin_message(msg, request):
    sender = msg.sender
    delivery = msg.delivery
    sender_role = "courier" if msg.sender_id == delivery.driver_id else "customer"
    return {
        "id": msg.id,
        "delivery_id": msg.delivery_id,
        "sender_id": msg.sender_id,
        "sender_name": sender.get_full_name() or sender.email,
        "sender_role": sender_role,
        "message": msg.message or "",
        "image_url": _image_url(msg, request),
        "has_image": bool(msg.image),
        "is_read": msg.is_read,
        "is_hidden": msg.is_hidden,
        "hidden_reason": msg.hidden_reason,
        "report_count": msg.report_count,
        "created_at": msg.created_at.isoformat(),
    }


def _serialize_case(delivery, request=None):
    customer = delivery.customer
    courier = delivery.driver
    open_reports = delivery.chat_reports.filter(status="open").count()
    return {
        "delivery_id": delivery.id,
        "status": delivery.status,
        "case_reasons": get_chat_case_reasons(delivery),
        "customer_name": customer.get_full_name() if customer else "",
        "customer_email": customer.email if customer else "",
        "courier_name": courier.get_full_name() if courier else "",
        "courier_email": courier.email if courier else "",
        "pickup": delivery.pickup,
        "destination": delivery.destination,
        "open_reports": open_reports,
        "message_count": delivery.messages.count(),
        "created_at": delivery.created_at.isoformat() if delivery.created_at else None,
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_chat_cases(request):
    deliveries = Delivery.objects.select_related("customer", "driver").order_by("-updated_at")[:300]
    cases = [case for case in (_serialize_case(delivery, request) for delivery in deliveries) if case["case_reasons"]]
    reports = DeliveryChatReport.objects.select_related(
        "delivery", "reported_by", "reported_user", "message"
    ).filter(status="open")[:100]

    return Response(
        {
            "cases": cases,
            "open_reports": [
                {
                    "id": report.id,
                    "delivery_id": report.delivery_id,
                    "message_id": report.message_id,
                    "reason": report.reason,
                    "details": report.details,
                    "status": report.status,
                    "reported_by": report.reported_by.get_full_name() or report.reported_by.email,
                    "reported_user": (
                        report.reported_user.get_full_name() or report.reported_user.email
                        if report.reported_user
                        else ""
                    ),
                    "created_at": report.created_at.isoformat(),
                }
                for report in reports
            ],
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_chat_history(request, delivery_id):
    delivery = get_object_or_404(Delivery.objects.select_related("customer", "driver"), id=delivery_id)
    if not admin_can_view_chat(delivery):
        return Response(
            {"detail": "Chat history is private unless a dispute, exception, or safety case is open."},
            status=status.HTTP_403_FORBIDDEN,
        )

    messages = (
        DeliveryMessage.objects.filter(delivery=delivery)
        .select_related("sender", "hidden_by")
        .order_by("created_at")
    )
    reports = delivery.chat_reports.select_related("reported_by", "reported_user", "message").order_by("-created_at")
    disputes = delivery.disputes.order_by("-created_at")

    return Response(
        {
            "case": _serialize_case(delivery, request),
            "messages": [_serialize_admin_message(msg, request) for msg in messages],
            "reports": [
                {
                    "id": report.id,
                    "message_id": report.message_id,
                    "reason": report.reason,
                    "details": report.details,
                    "status": report.status,
                    "reported_by": report.reported_by.get_full_name() or report.reported_by.email,
                    "reported_user": (
                        report.reported_user.get_full_name() or report.reported_user.email
                        if report.reported_user
                        else ""
                    ),
                    "dispute_id": report.dispute_id,
                    "created_at": report.created_at.isoformat(),
                }
                for report in reports
            ],
            "disputes": [
                {
                    "id": dispute.id,
                    "reason": dispute.reason,
                    "description": dispute.description,
                    "status": dispute.status,
                    "resolution": dispute.resolution,
                }
                for dispute in disputes
            ],
        }
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_hide_message(request, message_id):
    msg = get_object_or_404(
        DeliveryMessage.objects.select_related("delivery"),
        id=message_id,
    )
    if not admin_can_view_chat(msg.delivery):
        return Response({"detail": "Not authorized for this delivery chat."}, status=status.HTTP_403_FORBIDDEN)

    reason = (request.data.get("reason") or "Removed by admin for policy violation.").strip()
    msg.is_hidden = True
    msg.hidden_reason = reason[:500]
    msg.hidden_at = timezone.now()
    msg.hidden_by = request.user
    msg.save(update_fields=["is_hidden", "hidden_reason", "hidden_at", "hidden_by"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery_message",
        entity_id=msg.id,
        summary=f"Hidden delivery chat message #{msg.id}",
        details={"delivery_id": msg.delivery_id, "reason": reason},
    )
    return Response(_serialize_admin_message(msg, request))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_warn_chat_user(request, delivery_id):
    delivery = get_object_or_404(Delivery.objects.select_related("driver", "customer"), id=delivery_id)
    if not admin_can_view_chat(delivery):
        return Response({"detail": "Not authorized for this delivery chat."}, status=status.HTTP_403_FORBIDDEN)

    target = (request.data.get("target") or "courier").strip().lower()
    reason = (request.data.get("reason") or "Chat policy warning issued by admin.").strip()
    user = delivery.driver if target == "courier" else delivery.customer
    if not user:
        return Response({"detail": "Target user not found."}, status=status.HTTP_400_BAD_REQUEST)

    if target == "courier":
        settings, _ = DriverDeliverySettings.objects.get_or_create(driver=user)
        settings.chat_warnings = (settings.chat_warnings or 0) + 1
        settings.save(update_fields=["chat_warnings"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery_chat_user",
        entity_id=user.id,
        summary=f"Chat warning issued to {target} for delivery #{delivery.id}",
        details={"reason": reason, "delivery_id": delivery.id},
    )
    return Response({"message": f"Warning recorded for {target}.", "user_id": user.id})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_suspend_chat_user(request, delivery_id):
    delivery = get_object_or_404(Delivery.objects.select_related("driver"), id=delivery_id)
    if not admin_can_view_chat(delivery):
        return Response({"detail": "Not authorized for this delivery chat."}, status=status.HTTP_403_FORBIDDEN)

    reason = (request.data.get("reason") or "Suspended due to chat abuse.").strip()
    if not delivery.driver_id:
        return Response({"detail": "No courier assigned."}, status=status.HTTP_400_BAD_REQUEST)

    profile = get_object_or_404(DriverProfile, user_id=delivery.driver_id)
    settings, _ = DriverDeliverySettings.objects.get_or_create(driver=delivery.driver)
    settings.is_suspended = True
    settings.suspension_reason = reason
    settings.delivery_mode_enabled = False
    settings.save(update_fields=["is_suspended", "suspension_reason", "delivery_mode_enabled"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="courier",
        entity_id=profile.user_id,
        summary=f"Courier suspended from delivery chat case #{delivery.id}",
        details={"reason": reason},
    )
    return Response({"message": "Courier suspended.", "driver_id": profile.id})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_attach_chat_to_dispute(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    report_id = request.data.get("report_id")
    dispute_id = request.data.get("dispute_id")

    report = get_object_or_404(DeliveryChatReport, id=report_id, delivery=delivery)
    dispute = get_object_or_404(DeliveryDispute, id=dispute_id, delivery=delivery)
    report.dispute = dispute
    report.save(update_fields=["dispute"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery_chat_report",
        entity_id=report.id,
        summary=f"Attached chat report #{report.id} to dispute #{dispute.id}",
        details={"delivery_id": delivery.id},
    )
    return Response({"message": "Chat report attached to dispute.", "dispute_id": dispute.id})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_review_chat_report(request, report_id):
    report = get_object_or_404(DeliveryChatReport.objects.select_related("delivery"), id=report_id)
    action = (request.data.get("action") or "reviewed").strip().lower()
    if action not in {"reviewed", "dismissed"}:
        return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

    report.status = action
    report.reviewed_by = request.user
    report.reviewed_at = timezone.now()
    report.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="delivery_chat_report",
        entity_id=report.id,
        summary=f"Chat report #{report.id} marked {action}",
        details={"delivery_id": report.delivery_id},
    )
    return Response({"message": f"Report marked {action}.", "status": report.status})
