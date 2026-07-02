from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import DeviceToken


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_device(request):
    """
    Register or update a native push notification device token.

    POST /notifications/register-device/
    Body: { "token": "...", "platform": "ios"|"android", "app_type": "rider"|"driver" }
    """
    token = request.data.get("token", "").strip()
    platform = request.data.get("platform", "").strip().lower()
    app_type = request.data.get("app_type", "").strip().lower()

    if not token:
        return Response(
            {"error": "token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if platform not in ("ios", "android"):
        return Response(
            {"error": "platform must be 'ios' or 'android'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if app_type not in ("rider", "driver"):
        return Response(
            {"error": "app_type must be 'rider' or 'driver'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # If this token already exists for a different user, reassign it
    DeviceToken.objects.filter(token=token).exclude(user=request.user).delete()

    device_token, created = DeviceToken.objects.update_or_create(
        token=token,
        defaults={
            "user": request.user,
            "platform": platform,
            "app_type": app_type,
            "is_active": True,
        },
    )

    return Response(
        {
            "message": "Device registered successfully.",
            "id": device_token.id,
            "created": created,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )
