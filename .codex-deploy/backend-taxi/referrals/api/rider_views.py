from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from referrals.api.rider_serializers import (
    RiderReferralInfoSerializer,
    RiderReferralValidateRequestSerializer,
    RiderShareContentSerializer,
)
from referrals.services.rider_referral_service import RiderReferralService

# Mapping from validation error codes to HTTP status codes
_VALIDATION_ERROR_STATUS_MAP = {
    "invalid_format": status.HTTP_400_BAD_REQUEST,
    "code_not_found": status.HTTP_404_NOT_FOUND,
    "referrer_inactive": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "self_referral": status.HTTP_422_UNPROCESSABLE_ENTITY,
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rider_referral_code(request):
    """Return the authenticated rider's referral code and statistics.

    Response: { "code": "...", "successful_referrals": int, "total_credits_earned": "decimal" }
    """
    service = RiderReferralService()
    info = service.get_referral_info(request.user)
    serializer = RiderReferralInfoSerializer(info)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rider_referral_share(request):
    """Return a shareable referral message for the authenticated rider.

    Response: { "code": "...", "message": "..." }
    """
    service = RiderReferralService()
    share_content = service.get_share_content(request.user)
    serializer = RiderShareContentSerializer(share_content)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def rider_referral_validate(request):
    """Validate a rider referral code (public endpoint).

    Used during signup to check if a referral code is valid before registration
    completes. Accepts optional authentication — if the user is authenticated,
    self-referral checking is performed; otherwise it is skipped.

    Request body: { "code": "ABCD1234" }
    Response (valid):   { "is_valid": true, "code": "ABCD1234" } (200)
    Response (invalid): { "is_valid": false, "error_code": "...", "error_message": "..." }
                        (400 for format, 404 for not found, 422 for inactive/self-referral)
    """
    serializer = RiderReferralValidateRequestSerializer(data=request.data)
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

    service = RiderReferralService()
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
