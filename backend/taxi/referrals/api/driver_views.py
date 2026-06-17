from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from referrals.api.driver_serializers import (
    DriverReferralCodeSerializer,
    DriverReferralStatusResponseSerializer,
    DriverReferralValidateRequestSerializer,
)
from referrals.services.driver_referral_service import DriverReferralService

# Mapping from validation error codes to HTTP status codes
_VALIDATION_ERROR_STATUS_MAP = {
    "invalid_format": status.HTTP_400_BAD_REQUEST,
    "code_not_found": status.HTTP_404_NOT_FOUND,
    "referrer_inactive": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "self_referral": status.HTTP_422_UNPROCESSABLE_ENTITY,
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_referral_code(request):
    """Return the authenticated driver's referral code.

    Auto-generates a referral code if the driver doesn't have one yet.

    Response: { "code": "ABCD1234" }
    """
    service = DriverReferralService()
    try:
        code = service.generate_referral_code(request.user)
    except RuntimeError:
        return Response(
            {"error": "Unable to generate referral code. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    serializer = DriverReferralCodeSerializer({"code": code})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_referral_status(request):
    """Return the list of referred drivers with their progress.

    Response: {
        "referrals": [
            {
                "referee_name": "...",
                "completed_rides": int,
                "ride_threshold": int,
                "status": "pending|completed|expired"
            }
        ]
    }
    """
    service = DriverReferralService()
    statuses = service.get_referral_status(request.user)

    # Convert dataclass list to serializable dicts
    referrals_data = [
        {
            "referee_name": s.referee_name,
            "completed_rides": s.completed_rides,
            "ride_threshold": s.ride_threshold,
            "status": s.status,
        }
        for s in statuses
    ]

    serializer = DriverReferralStatusResponseSerializer(
        {"referrals": referrals_data}
    )
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def driver_referral_validate(request):
    """Validate a driver referral code (public endpoint).

    Used during driver signup to check if a referral code is valid before
    registration completes. Accepts optional authentication — if the user is
    authenticated, self-referral checking is performed; otherwise it is skipped.

    Request body: { "code": "ABCD1234" }
    Response (valid):   { "is_valid": true, "code": "ABCD1234" } (200)
    Response (invalid): { "is_valid": false, "error_code": "...", "error_message": "..." }
                        (400 for format, 404 for not found, 422 for inactive/self-referral)
    """
    serializer = DriverReferralValidateRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {
                "is_valid": False,
                "error_code": "invalid_format",
                "error_message": "Referral code must be exactly 8 alphanumeric characters.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = serializer.validated_data["code"]

    # Determine referee: use authenticated user if available, otherwise None
    referee = None
    if request.user and request.user.is_authenticated:
        referee = request.user

    service = DriverReferralService()
    result = service.validate_referral_code(code, referee)

    if result.is_valid:
        return Response(
            {"is_valid": True, "code": code},
            status=status.HTTP_200_OK,
        )

    # Map error_code to appropriate HTTP status
    http_status = _VALIDATION_ERROR_STATUS_MAP.get(
        result.error_code, status.HTTP_400_BAD_REQUEST
    )
    return Response(
        {
            "is_valid": False,
            "error_code": result.error_code,
            "error_message": result.error_message,
        },
        status=http_status,
    )
