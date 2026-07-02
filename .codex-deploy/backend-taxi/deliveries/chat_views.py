"""Delivery chat and masked-call API endpoints."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .chat_templates import resolve_template, templates_for_role
from .models import Delivery, DeliveryChatMessage
from .services.masked_call_service import MaskedCallError, create_call_session


def _delivery_role(user, delivery):
    if user.id == delivery.customer_id:
        return "customer"
    if user.id == delivery.driver_id:
        return "courier"
    return None


def _active_delivery_statuses():
    return {"accepted", "courier_arriving", "picked_up", "in_transit", "delivering"}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_chat_templates(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
    return Response({"templates": templates_for_role(role)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_chat_messages(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    messages = DeliveryChatMessage.objects.filter(delivery=delivery).select_related("sender")
    messages.filter(read=False).exclude(sender=request.user).update(read=True)

    return Response(
        [
            {
                "id": msg.id,
                "template_key": msg.template_key,
                "text": msg.text,
                "is_mine": msg.sender_id == request.user.id,
                "sender_name": msg.sender.get_full_name() or msg.sender.email,
                "created_at": msg.created_at.isoformat(),
                "read": msg.read,
            }
            for msg in messages
        ]
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delivery_chat_send(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    role = _delivery_role(request.user, delivery)
    if not role:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
    if delivery.status not in _active_delivery_statuses():
        return Response(
            {"detail": "Chat is only available during an active delivery."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    template_key = (request.data.get("template_key") or "").strip()
    template = resolve_template(template_key, role)
    if not template:
        return Response(
            {"detail": "Invalid chat template.", "code": "invalid_template"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    msg = DeliveryChatMessage.objects.create(
        delivery=delivery,
        sender=request.user,
        template_key=template_key,
        text=template["text"],
    )

    recipient = delivery.driver if role == "customer" else delivery.customer
    if recipient:
        try:
            from notifications.push import notify_delivery_chat_message

            notify_delivery_chat_message(
                recipient,
                delivery,
                request.user.get_full_name() or "Contact",
                template["text"],
            )
        except Exception:
            pass

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"delivery_{delivery.id}",
                {
                    "type": "delivery_chat",
                    "message": {
                        "type": "delivery_chat_message",
                        "delivery_id": delivery.id,
                        "message_id": msg.id,
                        "text": msg.text,
                        "template_key": msg.template_key,
                        "sender_id": msg.sender_id,
                    },
                },
            )
    except Exception:
        pass

    return Response(
        {
            "id": msg.id,
            "template_key": msg.template_key,
            "text": msg.text,
            "is_mine": True,
            "created_at": msg.created_at.isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delivery_call_session(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    try:
        session = create_call_session(delivery, request.user)
    except MaskedCallError as exc:
        return Response({"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(session)
