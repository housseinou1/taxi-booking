from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import PushSubscription


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscribe_push(request):
    """Register a push subscription for the authenticated user."""
    endpoint = request.data.get("endpoint", "")
    p256dh = request.data.get("keys", {}).get("p256dh", "") or request.data.get("p256dh", "")
    auth = request.data.get("keys", {}).get("auth", "") or request.data.get("auth", "")

    if not endpoint or not p256dh or not auth:
        return Response(
            {"error": "endpoint, keys.p256dh, and keys.auth are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    PushSubscription.objects.update_or_create(
        user=request.user,
        endpoint=endpoint,
        defaults={"p256dh": p256dh, "auth": auth},
    )

    return Response({"message": "Push subscription saved."}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unsubscribe_push(request):
    """Remove a push subscription."""
    endpoint = request.data.get("endpoint", "")
    deleted, _ = PushSubscription.objects.filter(
        user=request.user, endpoint=endpoint
    ).delete()

    return Response({"message": "Unsubscribed." if deleted else "Subscription not found."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_fcm_token(request):
    """Register or update an FCM token for push notifications."""
    from .models import FCMToken

    token = request.data.get("token", "").strip()
    device_type = request.data.get("device_type", "android")
    app_type = request.data.get("app_type", "web")

    if not token:
        return Response(
            {"error": "FCM token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if device_type not in ("android", "ios", "web"):
        device_type = "android"
    if app_type not in ("rider", "driver", "web"):
        app_type = "web"

    # Deactivate this token for other users (token can only belong to one user)
    FCMToken.objects.filter(token=token).exclude(user=request.user).update(is_active=False)

    # Create or update for this user
    fcm_token, created = FCMToken.objects.update_or_create(
        token=token,
        defaults={
            "user": request.user,
            "device_type": device_type,
            "app_type": app_type,
            "is_active": True,
        },
    )

    return Response({
        "message": "FCM token registered successfully.",
        "created": created,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unregister_fcm_token(request):
    """Unregister an FCM token (on logout)."""
    from .models import FCMToken

    token = request.data.get("token", "").strip()
    if token:
        FCMToken.objects.filter(token=token, user=request.user).update(is_active=False)

    return Response({"message": "FCM token unregistered."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_history(request):
    """Get the notification history for the current user."""
    from .models import NotificationHistory

    notifications = NotificationHistory.objects.filter(user=request.user)[:50]
    data = [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "type": n.notification_type,
            "ride_id": n.ride_id,
            "data": n.data,
            "deep_link": n.deep_link,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_notifications_read(request):
    """Mark notifications as read."""
    from .models import NotificationHistory

    ids = request.data.get("ids", [])
    if ids:
        NotificationHistory.objects.filter(user=request.user, id__in=ids).update(is_read=True)
    else:
        NotificationHistory.objects.filter(user=request.user, is_read=False).update(is_read=True)

    return Response({"message": "Notifications marked as read."})
