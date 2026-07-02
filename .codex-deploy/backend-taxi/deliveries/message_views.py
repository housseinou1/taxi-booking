"""Delivery in-app messaging API (free-text, images, quick replies)."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .message_quick_replies import quick_replies_for_role
from .models import Delivery, DeliveryChatReport, DeliveryMessage
from .services.message_safety import MessageSafetyError, validate_message_payload

REPORT_REASONS = {
    "harassment",
    "inappropriate_message",
    "wrong_address",
    "unsafe_situation",
    "fraud_attempt",
}


CHAT_ACTIVE_STATUSES = {
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
}

CHAT_CLOSED_STATUSES = {"delivered", "cancelled", "delivery_exception"}


def _delivery_role(user, delivery):
    if user.id == delivery.customer_id:
        return "customer"
    if user.id == delivery.driver_id:
        return "courier"
    return None


def _image_url(msg, request):
    if not msg.image:
        return None
    url = msg.image.url
    if request:
        return request.build_absolute_uri(url)
    return url


def _serialize_message(msg, viewer_id, delivery, request=None, *, for_participant=False):
    sender = msg.sender
    sender_role = "courier" if msg.sender_id == delivery.driver_id else "customer"
    hidden_for_viewer = for_participant and msg.is_hidden and msg.sender_id != viewer_id
    payload = {
        "id": msg.id,
        "delivery_id": msg.delivery_id,
        "sender_id": msg.sender_id,
        "sender_name": sender.get_full_name() or sender.email,
        "sender_role": sender_role,
        "message": "[Message removed]" if hidden_for_viewer else (msg.message or ""),
        "image_url": None if hidden_for_viewer else _image_url(msg, request),
        "has_image": False if hidden_for_viewer else bool(msg.image),
        "is_mine": msg.sender_id == viewer_id,
        "is_read": msg.is_read,
        "is_hidden": msg.is_hidden,
        "created_at": msg.created_at.isoformat(),
    }
    return payload


def _broadcast_message_event(delivery, event_type, payload):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        from .websocket import send_delivery_chat_event

        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(send_delivery_chat_event)(
                channel_layer,
                delivery.id,
                event_type,
                payload,
            )
    except Exception:
        pass


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_messages_list(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    messages = (
        DeliveryMessage.objects.filter(delivery=delivery)
        .select_related("sender", "delivery")
        .order_by("created_at")
    )
    unread = messages.filter(is_read=False).exclude(sender=request.user).count()

    return Response(
        {
            "messages": [
                _serialize_message(msg, request.user.id, delivery, request, for_participant=True)
                for msg in messages
            ],
            "quick_replies": quick_replies_for_role(role),
            "chat_available": delivery.status in CHAT_ACTIVE_STATUSES,
            "unread_count": unread,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def delivery_messages_send(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
    if delivery.status not in CHAT_ACTIVE_STATUSES:
        return Response(
            {"detail": "Chat is closed for this delivery.", "code": "chat_closed"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_text = request.data.get("message") or request.data.get("text") or ""
    image_file = request.FILES.get("image")
    try:
        text = validate_message_payload(raw_text, image_file, delivery.id, request.user.id)
    except MessageSafetyError as exc:
        return Response({"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

    msg = DeliveryMessage.objects.create(
        delivery=delivery,
        sender=request.user,
        message=text,
        image=image_file,
    )

    serialized = _serialize_message(msg, request.user.id, delivery, request)
    event_type = "chat_image_sent" if msg.image else "message_sent"
    _broadcast_message_event(
        delivery,
        event_type,
        {"message": serialized},
    )

    recipient = delivery.driver if role == "customer" else delivery.customer
    if recipient:
        try:
            from notifications.push import notify_delivery_chat_message

            push_preview = text or "Sent a photo"
            notify_delivery_chat_message(
                recipient,
                delivery,
                request.user.get_full_name() or "Contact",
                push_preview,
            )
        except Exception:
            pass

    return Response(serialized, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delivery_messages_read(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    updated = (
        DeliveryMessage.objects.filter(delivery=delivery, is_read=False)
        .exclude(sender=request.user)
        .update(is_read=True)
    )

    if updated:
        _broadcast_message_event(
            delivery,
            "message_read",
            {
                "reader_id": request.user.id,
                "reader_role": role,
                "read_count": updated,
            },
        )

    return Response({"read_count": updated, "unread_count": 0})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_messages_unread(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    count = (
        DeliveryMessage.objects.filter(delivery=delivery, is_read=False)
        .exclude(sender=request.user)
        .count()
    )
    return Response({"unread_count": count, "chat_available": delivery.status in CHAT_ACTIVE_STATUSES})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delivery_messages_report(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    reason = (request.data.get("reason") or "").strip().lower()
    if reason not in REPORT_REASONS:
        return Response(
            {"detail": "Invalid report reason.", "code": "invalid_reason"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    details = (request.data.get("details") or "").strip()[:1000]
    message_id = request.data.get("message_id")
    message = None
    reported_user = None

    if message_id:
        message = get_object_or_404(DeliveryMessage, id=message_id, delivery=delivery)
        if message.sender_id == request.user.id:
            return Response(
                {"detail": "You cannot report your own message."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reported_user_id = message.sender_id
        message.report_count = (message.report_count or 0) + 1
        message.save(update_fields=["report_count"])
    else:
        reported_user_id = delivery.driver_id if role == "customer" else delivery.customer_id

    if reported_user_id:
        from django.contrib.auth import get_user_model

        reported_user = get_user_model().objects.filter(id=reported_user_id).first()

    report = DeliveryChatReport.objects.create(
        delivery=delivery,
        message=message,
        reported_by=request.user,
        reported_user=reported_user,
        reason=reason,
        details=details,
    )

    return Response(
        {
            "id": report.id,
            "delivery_id": delivery.id,
            "message_id": message.id if message else None,
            "reason": report.reason,
            "status": report.status,
            "created_at": report.created_at.isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )
