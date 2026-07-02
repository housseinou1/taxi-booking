from datetime import date
from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from referrals.api.admin_serializers import (
    FlaggedReferralSerializer,
    RewardConfigurationSerializer,
)
from referrals.models import FlaggedReferral
from referrals.services.analytics_service import AnalyticsService
from referrals.services.fraud_detection_service import FraudDetectionService
from referrals.services.reward_config_service import RewardConfigService


@api_view(["GET", "PUT"])
@permission_classes([IsAdminUser])
def admin_config(request):
    """GET: Return the current active reward configuration.
    PUT: Validate and update the reward configuration.
    """
    service = RewardConfigService()

    if request.method == "GET":
        config = service.get_active_config()
        serializer = RewardConfigurationSerializer(config)
        return Response(serializer.data)

    # PUT: validate and update config
    data = request.data

    # Coerce incoming values to appropriate types for validation
    config_kwargs = {}
    field_errors = {}

    for field, (min_val, max_val) in service.FIELD_RANGES.items():
        if field in data:
            value = data[field]
            if isinstance(min_val, Decimal):
                try:
                    config_kwargs[field] = Decimal(str(value))
                except (ValueError, TypeError, InvalidOperation):
                    field_errors[field] = (
                        f"Field '{field}' must be a valid decimal number."
                    )
            else:
                try:
                    config_kwargs[field] = int(value)
                except (ValueError, TypeError):
                    field_errors[field] = (
                        f"Field '{field}' must be a valid integer."
                    )

    # Check for unknown fields
    for field in data:
        if field not in service.FIELD_RANGES:
            field_errors[field] = (
                f"Field '{field}' is not a configurable reward parameter."
            )

    if field_errors:
        return Response(
            {"errors": field_errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate using the service
    validation_errors = service.validate_config_values(**config_kwargs)
    if validation_errors:
        # Convert list of error strings to field-specific dict
        errors_dict = {}
        for error_msg in validation_errors:
            # Extract field name from error message
            for field in config_kwargs:
                if field in error_msg:
                    errors_dict[field] = error_msg
                    break
            else:
                errors_dict["non_field_errors"] = error_msg
        return Response(
            {"errors": errors_dict},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Apply the update
    new_config = service.update_config(request.user, **config_kwargs)
    serializer = RewardConfigurationSerializer(new_config)
    return Response(
        {
            "message": "Configuration updated successfully",
            "updated_at": new_config.updated_at.isoformat(),
            **serializer.data,
        },
        status=status.HTTP_200_OK,
    )



class FlaggedReferralPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_flagged_list(request):
    """GET: Return a paginated list of flagged referrals."""
    queryset = FlaggedReferral.objects.select_related(
        "referrer", "referee", "resolved_by"
    ).order_by("-flagged_at", "-id")

    paginator = FlaggedReferralPagination()
    page = paginator.paginate_queryset(queryset, request)
    serializer = FlaggedReferralSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_flagged_approve(request, pk):
    """POST: Approve a flagged referral, releasing withheld rewards."""
    service = FraudDetectionService()
    try:
        service.approve_referral(pk, request.user)
    except FlaggedReferral.DoesNotExist:
        return Response(
            {"detail": "Flagged referral not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    except ValueError as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"message": "Flagged referral approved successfully."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_flagged_reject(request, pk):
    """POST: Reject a flagged referral, revoking associated rewards."""
    service = FraudDetectionService()
    try:
        service.reject_referral(pk, request.user)
    except FlaggedReferral.DoesNotExist:
        return Response(
            {"detail": "Flagged referral not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    except ValueError as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"message": "Flagged referral rejected successfully."},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_analytics(request):
    """GET: Return referral analytics for the given date range.

    Query params:
        date_from / start_date: ISO format date (YYYY-MM-DD). Defaults to 30 days ago.
        date_to / end_date: ISO format date (YYYY-MM-DD). Defaults to today.
    """
    service = AnalyticsService()

    start_date = None
    end_date = None

    # Accept both date_from/date_to and start_date/end_date
    start_date_str = request.query_params.get(
        "date_from", request.query_params.get("start_date")
    )
    end_date_str = request.query_params.get(
        "date_to", request.query_params.get("end_date")
    )

    if start_date_str:
        try:
            start_date = date.fromisoformat(start_date_str)
        except ValueError:
            return Response(
                {"error": "date_from must be in ISO format (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if end_date_str:
        try:
            end_date = date.fromisoformat(end_date_str)
        except ValueError:
            return Response(
                {"error": "date_to must be in ISO format (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    data = service.get_analytics(start_date=start_date, end_date=end_date)
    return Response(data, status=status.HTTP_200_OK)
