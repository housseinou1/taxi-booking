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
