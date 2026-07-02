import django_filters
from django.db.models import Count, Sum
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from promotions.models import PromoCode, PromoCodeUsage, ReferralCode
from promotions.serializers import (
    OverallAnalyticsSerializer,
    PromoCodeAdminSerializer,
    PromoCodeAnalyticsSerializer,
    PromoCodeApplyResponseSerializer,
    PromoCodeApplySerializer,
    PromoCodeListSerializer,
    PromoCodeValidateResponseSerializer,
    PromoCodeValidateSerializer,
    ReferralCodeSerializer,
)
from promotions.services import PromoCodeService
from taxi.security.abuse import rate_limit


# --- Admin views ---


class PromoCodeFilter(django_filters.FilterSet):
    """FilterSet for filtering promo codes by status, discount_type, and date range."""

    start_date_after = django_filters.DateTimeFilter(
        field_name="start_date", lookup_expr="gte"
    )
    start_date_before = django_filters.DateTimeFilter(
        field_name="start_date", lookup_expr="lte"
    )
    end_date_after = django_filters.DateTimeFilter(
        field_name="end_date", lookup_expr="gte"
    )
    end_date_before = django_filters.DateTimeFilter(
        field_name="end_date", lookup_expr="lte"
    )

    class Meta:
        model = PromoCode
        fields = ["status", "discount_type"]


class PromoCodeAdminViewSet(ModelViewSet):
    """
    Admin viewset for managing promo codes.

    Provides full CRUD operations plus a deactivate action.
    Protected by IsAdminUser permission.
    """

    permission_classes = [IsAdminUser]
    filterset_class = PromoCodeFilter

    def get_serializer_class(self):
        if self.action == "list":
            return PromoCodeListSerializer
        return PromoCodeAdminSerializer

    def get_queryset(self):
        if self.action == "list":
            return PromoCode.objects.annotate(total_uses=Count("usages"))
        return PromoCode.objects.all()

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        """Deactivate a promo code by setting its status to inactive."""
        promo_code = self.get_object()
        promo_code.status = "inactive"
        promo_code.save(update_fields=["status", "updated_at"])
        serializer = PromoCodeAdminSerializer(promo_code)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="analytics")
    def analytics(self, request, pk=None):
        """
        GET /promotions/admin/codes/{id}/analytics/

        Return analytics for a specific promo code:
        - total_redemptions: count of usage records
        - total_discount_amount: sum of discount_amount across all usages
        - unique_riders: count of distinct riders who used the code
        """
        promo_code = self.get_object()
        stats = PromoCodeUsage.objects.filter(promo_code=promo_code).aggregate(
            total_redemptions=Count("id"),
            total_discount_amount=Sum("discount_amount"),
            unique_riders=Count("rider", distinct=True),
        )

        # Handle case where there are no usages (Sum returns None)
        stats["total_discount_amount"] = stats["total_discount_amount"] or 0

        serializer = PromoCodeAnalyticsSerializer(data=stats)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# --- Overall Analytics view ---


class OverallAnalyticsView(APIView):
    """
    GET /promotions/admin/analytics/

    Return overall promo analytics with optional date range filtering.
    Accepts optional query params: start_date, end_date (ISO 8601 format).
    Returns total promotional spend, total redemptions, and unique codes used.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        parsed_start = None
        parsed_end = None

        if start_date:
            parsed_start = parse_datetime(start_date)
            if not parsed_start:
                return Response(
                    {"detail": "Invalid start_date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if end_date:
            parsed_end = parse_datetime(end_date)
            if not parsed_end:
                return Response(
                    {"detail": "Invalid end_date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        usages = PromoCodeUsage.objects.all()

        if parsed_start:
            usages = usages.filter(created_at__gte=parsed_start)
        if parsed_end:
            usages = usages.filter(created_at__lte=parsed_end)

        stats = usages.aggregate(
            total_promotional_spend=Sum("discount_amount"),
            total_redemptions=Count("id"),
            unique_codes_used=Count("promo_code", distinct=True),
        )

        # Handle case where there are no usages (Sum returns None)
        stats["total_promotional_spend"] = stats["total_promotional_spend"] or 0

        response_data = {
            "total_promotional_spend": stats["total_promotional_spend"],
            "total_redemptions": stats["total_redemptions"],
            "unique_codes_used": stats["unique_codes_used"],
            "date_range_start": parsed_start,
            "date_range_end": parsed_end,
        }

        serializer = OverallAnalyticsSerializer(data=response_data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# --- Rider views ---


class PromoCodeValidateView(APIView):
    """
    POST /promotions/validate/

    Validate a promo code and return a discount preview.
    Returns 200 with response body indicating validity (not 4xx for invalid codes).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        retry_after = rate_limit(request, "promo-validate", limit=20, window_seconds=600)
        if retry_after:
            return Response(
                {"detail": "Too many promo code attempts. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
            )

        serializer = PromoCodeValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data["code"]
        estimated_fare = serializer.validated_data["estimated_fare"]

        service = PromoCodeService()
        result = service.validate_code(code, request.user, estimated_fare)

        response_data = {
            "valid": result.valid,
            "discount_amount": result.discount_amount,
            "final_fare": result.final_fare,
            "discount_type": result.discount_type,
            "error_code": result.error_code,
            "message": result.message,
        }

        response_serializer = PromoCodeValidateResponseSerializer(data=response_data)
        response_serializer.is_valid(raise_exception=True)

        return Response(response_serializer.data, status=status.HTTP_200_OK)


class PromoCodeApplyView(APIView):
    """
    POST /promotions/apply/

    Apply a promo code to a ride.
    Verifies the ride belongs to the requesting rider.
    Updates the payment record with the discount amount.
    Returns 404 if ride not found or doesn't belong to rider.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        retry_after = rate_limit(request, "promo-apply", limit=5, window_seconds=600)
        if retry_after:
            return Response(
                {"detail": "Too many promo code attempts. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
            )

        from taxi.rides.models import Ride
        from payments.services import authorize_ride_payment

        serializer = PromoCodeApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data["code"]
        ride_id = serializer.validated_data["ride_id"]

        # Look up the ride and verify it belongs to the requesting rider
        try:
            ride = Ride.objects.get(id=ride_id, rider=request.user)
        except Ride.DoesNotExist:
            return Response(
                {"detail": "Ride not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        service = PromoCodeService()
        result = service.apply_code(code, request.user, ride, ride.fare)

        # If the promo code was successfully applied, update the payment
        if result.success:
            authorize_ride_payment(ride, discount_amount=result.discount_amount)

        response_data = {
            "success": result.success,
            "original_fare": result.original_fare,
            "discount_amount": result.discount_amount,
            "final_fare": result.final_fare,
            "error_code": result.error_code,
            "message": result.message,
        }

        response_serializer = PromoCodeApplyResponseSerializer(data=response_data)
        response_serializer.is_valid(raise_exception=True)

        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ReferralCodeView(APIView):
    """
    GET /promotions/referral/

    Return the rider's referral code. If the rider doesn't have one yet,
    generate one automatically.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            referral_code = ReferralCode.objects.get(rider=request.user)
        except ReferralCode.DoesNotExist:
            # Generate a referral code for the rider
            service = PromoCodeService()
            service.generate_referral_code(request.user)
            referral_code = ReferralCode.objects.get(rider=request.user)

        serializer = ReferralCodeSerializer(referral_code)
        return Response(serializer.data, status=status.HTTP_200_OK)
