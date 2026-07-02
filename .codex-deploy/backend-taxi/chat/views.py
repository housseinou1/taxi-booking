from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.rides.models import Ride
from notifications.push import notify_new_message
from .models import ChatMessage


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_messages(request, ride_id):
    """Get all chat messages for a ride. Only rider or driver can access."""
    ride = get_object_or_404(Ride, id=ride_id)

    if request.user.id not in (ride.rider_id, ride.driver_id):
        return Response({"error": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    messages = ChatMessage.objects.filter(ride=ride).order_by("created_at")

    # Mark messages as read
    messages.filter(read=False).exclude(sender=request.user).update(read=True)

    data = [
        {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": f"{msg.sender.first_name} {msg.sender.last_name}".strip(),
            "is_mine": msg.sender_id == request.user.id,
            "text": msg.text,
            "created_at": msg.created_at.isoformat(),
            "read": msg.read,
        }
        for msg in messages
    ]

    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_message(request, ride_id):
    """Send a chat message. Only rider or assigned driver can send."""
    ride = get_object_or_404(Ride, id=ride_id)

    if request.user.id not in (ride.rider_id, ride.driver_id):
        return Response({"error": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    text = request.data.get("text", "").strip()
    if not text:
        return Response({"error": "Message cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)

    if len(text) > 500:
        return Response({"error": "Message too long (max 500 chars)"}, status=status.HTTP_400_BAD_REQUEST)

    msg = ChatMessage.objects.create(
        ride=ride,
        sender=request.user,
        text=text,
    )

    # Broadcast via WebSocket
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "rides",
            {
                "type": "ride_update",
                "message": {
                    "type": "chat_message",
                    "ride_id": ride.id,
                    "message_id": msg.id,
                    "sender_id": msg.sender_id,
                    "sender_name": f"{msg.sender.first_name} {msg.sender.last_name}".strip(),
                    "text": msg.text,
                    "created_at": msg.created_at.isoformat(),
                },
            },
        )
    except Exception:
        pass

    recipient = ride.driver if request.user == ride.rider else ride.rider
    if recipient:
        try:
            sender_name = request.user.get_full_name() or request.user.email
            notify_new_message(recipient, sender_name, ride)
        except Exception:
            pass

    return Response(
        {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": f"{msg.sender.first_name} {msg.sender.last_name}".strip(),
            "is_mine": True,
            "text": msg.text,
            "created_at": msg.created_at.isoformat(),
            "read": False,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request, ride_id):
    """Get count of unread messages for the current user."""
    ride = get_object_or_404(Ride, id=ride_id)

    if request.user.id not in (ride.rider_id, ride.driver_id):
        return Response({"error": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    count = ChatMessage.objects.filter(
        ride=ride, read=False
    ).exclude(sender=request.user).count()

    return Response({"unread": count})
