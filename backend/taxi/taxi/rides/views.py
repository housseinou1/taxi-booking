from datetime import timedelta
from decimal import Decimal
import logging
import math
import secrets
import sys
import threading

from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum
from django.db import transaction
from django.utils.timezone import now
from django.utils import timezone

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.market import MARKET, calculate_app_fee, calculate_fare
from payments.services import (
    authorize_corporate_ride_payment,
    authorize_ride_payment,
    cancel_ride_payment,
    capture_ride_payment,
)
from promotions.services import PromoCodeService
from taxi.drivers.models import DriverProfile
from taxi.security.abuse import rate_limit, pin_lockout_retry, record_pin_failure, record_cancellation, validate_coordinates
from admin_2fa.integrity import require_integrity
from locations.services import calculate_city_fare, resolve_city
from legal.ride_terms import ensure_ride_legal_acceptance

from .models import Ride, RidePricingSnapshot, RideStop
from .serializers import RideSerializer
from .broadcast import broadcast_ride_update
from .distance_utils import resolve_ride_distance_km
from .services.waiting_service import calculate_waiting_fee
from .services.no_show_service import (
    _parse_geo_coord,
    arrive_max_distance_m,
    CANONICAL_NO_SHOW_REASON,
    distance_to_pickup_m,
    evaluate_no_show_eligibility,
    get_no_show_fee_policy,
    is_no_show_reason,
)
from .timeout import (
    cancel_ride_request_timeout,
    start_ride_request_timeout,
)

from notifications.push import (
    notify_ride_accepted,
    notify_driver_arrived,
    notify_ride_started,
    notify_ride_completed,
    notify_payment_completed,
    notify_ride_cancelled,
    notify_new_ride_request_to_drivers,
)

logger = logging.getLogger(__name__)


def _run_in_background(target):
    if "test" in sys.argv:
        target()
        return
    threading.Thread(target=target, daemon=True).start()


def broadcast_ride_request_to_available_drivers(ride):
    """Send a targeted real-time request to each eligible online driver."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return 0

        active_driver_ids = Ride.objects.filter(
            status__in=DRIVER_ACTIVE_STATUSES,
            driver__isnull=False,
        ).values_list("driver_id", flat=True)

        profiles = DriverProfile.objects.filter(
            status="approved",
            is_available=True,
            user__is_active=True,
        ).exclude(user_id__in=active_driver_ids)

        if ride.city_id:
            profiles = profiles.filter(
                Q(user__city_id=ride.city_id) | Q(user__city__isnull=True)
            )

        ride_data = {
            "ride_id": ride.id,
            "pickup": ride.pickup,
            "destination": ride.destination,
            "pickup_lat": ride.pickup_lat,
            "pickup_lng": ride.pickup_lng,
            "destination_lat": ride.destination_lat,
            "destination_lng": ride.destination_lng,
            "fare": str(ride.fare),
            "distance_km": str(ride.distance_km),
            "countdown": 30,
            "rider_id": ride.rider_id,
        }

        driver_ids = list(profiles.values_list("user_id", flat=True))
        for driver_user_id in driver_ids:
            async_to_sync(channel_layer.group_send)(
                f"driver_{driver_user_id}",
                {
                    "type": "ride_request",
                    "message": {
                        "type": "ride_request",
                        **ride_data,
                    },
                },
            )
        return len(driver_ids)
    except Exception:
        logger.exception(
            "Failed to broadcast ride request %s to available drivers",
            ride.id,
        )
        return 0


OPEN_RIDE_STATUSES = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"]
DRIVER_ACTIVE_STATUSES = ["driver_arriving", "driver_arrived", "in_progress"]
VALID_RIDE_TYPES = set(MARKET["fare"].keys())


def approved_driver_error(user):
    if getattr(user, "user_type", "") != "driver":
        return "Only driver accounts can view or accept ride requests."

    if not user.is_phone_verified:
        return "Verify your phone number before viewing or accepting ride requests."

    if not DriverProfile.objects.filter(user=user, status="approved").exists():
        return "Your driver application must be approved before viewing or accepting rides."

    return ""


def calculate_money(ride):
    from app_settings.pricing_service import (
        calculate_ride_app_fee,
        get_ride_commission_percent,
    )

    fare = ride.fare or 0
    commission_percent = get_ride_commission_percent(ride)
    app_fee = calculate_ride_app_fee(fare, commission_percent)
    driver_earning = fare - app_fee

    ride.app_fee = app_fee
    ride.driver_earning = driver_earning
    ride.save()

    return ride


def create_initial_stops(ride, stops):
    if not stops:
        return

    if not isinstance(stops, list):
        raise ValueError("stops must be a list.")

    for index, stop in enumerate(stops, start=1):
        location_name = stop.get("location_name")
        latitude = stop.get("latitude")
        longitude = stop.get("longitude")
        stop_order = stop.get("stop_order") or index

        if not location_name:
            raise ValueError("Each stop must include location_name.")

        if latitude is None or longitude is None:
            raise ValueError("Each stop must include latitude and longitude.")

        try:
            latitude = float(latitude)
            longitude = float(longitude)
            stop_order = int(stop_order)
        except (TypeError, ValueError):
            raise ValueError("Stop latitude, longitude, and stop_order must be valid numbers.")

        if stop_order < 1:
            raise ValueError("stop_order must be at least 1.")

        RideStop.objects.create(
            ride=ride,
            stop_order=stop_order,
            location_name=location_name,
            latitude=latitude,
            longitude=longitude,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_ride(request):
    retry_after = rate_limit(request, "ride-request", limit=5, window_seconds=600)
    if retry_after:
        return Response(
            {"detail": "Too many ride requests. Please wait before trying again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    if not require_integrity(request.user.id):
        return Response(
            {
                "detail": "Device integrity check required. Update the app or use an official Play Store install.",
                "code": "integrity_required",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if getattr(request.user, "rider_status", "approved") != "approved":
        return Response(
            {"detail": "Rider account must be approved by admin before requesting a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    terms_error = ensure_ride_legal_acceptance(request.user, request.data, request)
    if terms_error is not None:
        return terms_error

    existing_ride = (
        Ride.objects.filter(rider=request.user, status__in=OPEN_RIDE_STATUSES)
        .order_by("-id")
        .first()
    )

    if existing_ride:
        return Response(
            {
                "detail": (
                    "You already have an open ride. Complete or cancel it before "
                    "requesting another ride."
                ),
                "ride_id": existing_ride.id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        pickup_lat, pickup_lng = validate_coordinates(
            request.data.get("pickup_lat", MARKET["default_pickup_lat"]),
            request.data.get("pickup_lng", MARKET["default_pickup_lng"]),
        )
        destination_lat, destination_lng = validate_coordinates(
            request.data.get("destination_lat", MARKET["default_destination_lat"]),
            request.data.get("destination_lng", MARKET["default_destination_lng"]),
        )
        resolved_request_data = {
            **request.data,
            "pickup_lat": pickup_lat,
            "pickup_lng": pickup_lng,
            "destination_lat": destination_lat,
            "destination_lng": destination_lng,
        }
        distance_km = resolve_ride_distance_km(resolved_request_data)
    except (ValueError, TypeError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    ride_type = str(request.data.get("ride_type", "regular")).lower().strip()
    if ride_type not in VALID_RIDE_TYPES:
        return Response(
            {"detail": f"Unsupported ride type: {ride_type}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    city = resolve_city(
        city_id=request.data.get("city"),
        city_slug=request.data.get("city_slug"),
        fallback_user=request.user,
    )

    from app_settings.pricing_service import resolve_ride_fare

    result = resolve_ride_fare(city, ride_type, distance_km)
    fare = result.estimated_fare

    billing_source = (request.data.get("billing_source") or "personal").strip().lower()
    corporate_account = None
    cost_center = (request.data.get("cost_center") or "")[:100]
    if billing_source == "corporate":
        from features.corporate_service import apply_corporate_discount, validate_corporate_booking

        try:
            employee, corporate_account = validate_corporate_booking(request.user, fare)
            fare = apply_corporate_discount(fare, corporate_account)
            if not cost_center:
                cost_center = employee.cost_center
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    referral_code = request.data.get("referral_code") or None

    try:
        with transaction.atomic():
            ride = Ride.objects.create(
                rider=request.user,
                pickup=request.data.get("pickup", MARKET["default_pickup"]),
                destination=request.data.get("destination", MARKET["default_destination"]),
                pickup_lat=pickup_lat,
                pickup_lng=pickup_lng,
                destination_lat=destination_lat,
                destination_lng=destination_lng,
                city=city,
                distance_km=distance_km,
                ride_type=ride_type,
                fare=fare,
                app_fee=result.app_fee,
                driver_earning=result.driver_earning,
                status="requested",
                referral_code=referral_code,
                billing_source=billing_source,
                corporate_account=corporate_account,
                cost_center=cost_center,
            )
            RidePricingSnapshot.objects.create(
                ride=ride,
                ride_type=result.ride_type,
                source=result.source,
                city_pricing_id=result.city_pricing_id,
                global_fare_config_id=result.global_fare_config_id,
                base_fare=result.base_fare,
                per_km=result.per_km,
                minimum_fare=result.minimum_fare,
                billable_distance_km=result.billable_distance_km,
                distance_charge=result.distance_charge,
                estimated_fare=result.estimated_fare,
                commission_percent=result.commission_percent,
                commission_config_id=result.commission_config_id,
                waiting_policy_id=result.waiting_policy_id,
                cancellation_policy_id=result.cancellation_policy_id,
                no_show_policy_id=result.no_show_policy_id,
                effective_from=result.effective_from,
                app_fee=result.app_fee,
                driver_earning=result.driver_earning,
            )
            create_initial_stops(ride, request.data.get("stops", []))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # If a promo code is provided, validate it and pass the discount to payment
    discount_amount = 0
    promo_code = request.data.get("promo_code")
    if promo_code:
        service = PromoCodeService()
        validation = service.validate_code(promo_code, request.user, fare, city=city)
        if validation.valid:
            discount_amount = validation.discount_amount

    if ride.billing_source == "corporate":
        authorize_corporate_ride_payment(ride, discount_amount=discount_amount)
    else:
        authorize_ride_payment(ride, discount_amount=discount_amount)
    broadcast_ride_update(ride)

    from taxi.rides.services.ride_assignment_service import offer_ride_to_next_driver

    offer_ride_to_next_driver(ride)

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def schedule_ride(request):
    """Schedule a ride for a future time."""
    retry_after = rate_limit(request, "schedule-ride", limit=5, window_seconds=600)
    if retry_after:
        return Response(
            {"detail": "Too many scheduled ride requests. Please wait and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    if getattr(request.user, "rider_status", "approved") != "approved":
        return Response(
            {"detail": "Rider account must be approved before scheduling a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.is_phone_verified:
        return Response(
            {"detail": "Verify your phone number before scheduling a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    terms_error = ensure_ride_legal_acceptance(request.user, request.data, request)
    if terms_error is not None:
        return terms_error

    scheduled_at = request.data.get("scheduled_at")
    if not scheduled_at:
        return Response(
            {"detail": "scheduled_at is required (ISO format datetime)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.utils.dateparse import parse_datetime
    scheduled_time = parse_datetime(scheduled_at)
    if not scheduled_time:
        return Response(
            {"detail": "Invalid datetime format. Use ISO format: 2026-06-01T14:30:00"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if scheduled_time <= now():
        return Response(
            {"detail": "Scheduled time must be in the future."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    distance_km = Decimal(str(request.data.get("distance_km", request.data.get("distance", 0))))
    ride_type = str(request.data.get("ride_type", "regular")).lower().strip()
    if ride_type not in VALID_RIDE_TYPES:
        return Response(
            {"detail": f"Unsupported ride type: {ride_type}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    city = resolve_city(
        city_id=request.data.get("city"),
        city_slug=request.data.get("city_slug"),
        fallback_user=request.user,
    )

    from app_settings.pricing_service import resolve_ride_fare

    result = resolve_ride_fare(city, ride_type, distance_km)
    fare = result.estimated_fare

    billing_source = (request.data.get("billing_source") or "personal").strip().lower()
    corporate_account = None
    cost_center = (request.data.get("cost_center") or "")[:100]
    if billing_source == "corporate":
        from features.corporate_service import apply_corporate_discount, validate_corporate_booking

        try:
            employee, corporate_account = validate_corporate_booking(request.user, fare)
            fare = apply_corporate_discount(fare, corporate_account)
            if not cost_center:
                cost_center = employee.cost_center
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            ride = Ride.objects.create(
                rider=request.user,
                pickup=request.data.get("pickup", MARKET["default_pickup"]),
                destination=request.data.get("destination", MARKET["default_destination"]),
                pickup_lat=request.data.get("pickup_lat", MARKET["default_pickup_lat"]),
                pickup_lng=request.data.get("pickup_lng", MARKET["default_pickup_lng"]),
                destination_lat=request.data.get("destination_lat", MARKET["default_destination_lat"]),
                destination_lng=request.data.get("destination_lng", MARKET["default_destination_lng"]),
                city=city,
                distance_km=distance_km,
                ride_type=ride_type,
                fare=fare,
                app_fee=result.app_fee,
                driver_earning=result.driver_earning,
                status="scheduled",
                scheduled_at=scheduled_time,
                billing_source=billing_source,
                corporate_account=corporate_account,
                cost_center=cost_center,
            )
            RidePricingSnapshot.objects.create(
                ride=ride,
                ride_type=result.ride_type,
                source=result.source,
                city_pricing_id=result.city_pricing_id,
                global_fare_config_id=result.global_fare_config_id,
                base_fare=result.base_fare,
                per_km=result.per_km,
                minimum_fare=result.minimum_fare,
                billable_distance_km=result.billable_distance_km,
                distance_charge=result.distance_charge,
                estimated_fare=result.estimated_fare,
                commission_percent=result.commission_percent,
                commission_config_id=result.commission_config_id,
                waiting_policy_id=result.waiting_policy_id,
                cancellation_policy_id=result.cancellation_policy_id,
                no_show_policy_id=result.no_show_policy_id,
                effective_from=result.effective_from,
                app_fee=result.app_fee,
                driver_earning=result.driver_earning,
            )
            create_initial_stops(ride, request.data.get("stops", []))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_scheduled_rides(request):
    """Get all scheduled rides for the current rider."""
    rides = Ride.objects.filter(
        rider=request.user,
        status="scheduled",
        scheduled_at__gte=now(),
    ).order_by("scheduled_at")

    serializer = RideSerializer(rides, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_scheduled_ride(request, ride_id):
    """Cancel a scheduled ride."""
    ride = get_object_or_404(Ride, id=ride_id, rider=request.user, status="scheduled")
    ride.status = "cancelled"
    ride.save()
    return Response({"message": "Scheduled ride cancelled.", "ride_id": ride.id})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def estimate_fare(request):
    """Return a backend-computed fare estimate without creating a ride."""
    ride_type = str(request.data.get("ride_type", "regular")).lower().strip()
    if ride_type not in VALID_RIDE_TYPES:
        return Response(
            {"detail": f"Unsupported ride type: {ride_type}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    city = resolve_city(
        city_id=request.data.get("city"),
        city_slug=request.data.get("city_slug"),
        fallback_user=request.user,
    )

    distance_km = Decimal(str(request.data.get("distance_km", request.data.get("distance", 0))))
    if distance_km < 0:
        return Response(
            {"detail": "distance_km must be non-negative."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from app_settings.pricing_service import resolve_ride_fare

    result = resolve_ride_fare(city, ride_type, distance_km)

    return Response({
        "ride_type": ride_type,
        "estimated_fare": str(result.estimated_fare),
        "base_fare": str(result.base_fare),
        "distance_km": str(distance_km),
        "per_km": str(result.per_km),
        "distance_charge": str(result.distance_charge),
        "minimum_fare": str(result.minimum_fare),
        "waiting_fee": "0",
        "app_fee": str(result.app_fee),
        "driver_earning": str(result.driver_earning),
        "currency": MARKET["currency"],
        "is_estimate": True,
        "pricing_source": result.source,
        "city_override": result.source == "city",
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_rides(request):
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    # Only show rides to online/available drivers
    profile = DriverProfile.objects.filter(user=request.user).first()
    if profile and not profile.is_available:
        return Response([])

    rides = Ride.objects.filter(
        status="requested",
        driver__isnull=True,
        offered_driver=request.user,
    ).select_related("rider", "driver", "city")
    if request.user.city_id:
        rides = rides.filter(city_id=request.user.city_id)
    rides = rides.order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ride_history(request):
    if request.user.is_staff:
        rides = (
            Ride.objects.select_related("rider", "driver", "city")
            .prefetch_related("stops")
            .order_by("-id")
        )
        city_id = request.query_params.get("city")
        if city_id:
            rides = rides.filter(city_id=city_id)
        rides = rides[:500]
    else:
        rides = (
            Ride.objects.filter(rider=request.user)
            .select_related("driver", "city")
            .prefetch_related("stops")
            .order_by("-id")[:100]
        )

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


ACTIVE_RIDE_STATUSES = (
    "requested",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def active_ride(request):
    """Return the rider's current in-flight ride, if any."""
    if request.user.is_staff:
        ride = (
            Ride.objects.filter(status__in=ACTIVE_RIDE_STATUSES)
            .order_by("-id")
            .first()
        )
    else:
        ride = (
            Ride.objects.filter(
                rider=request.user,
                status__in=ACTIVE_RIDE_STATUSES,
            )
            .order_by("-id")
            .first()
        )

    if not ride:
        return Response(
            {"detail": "No active ride."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = RideSerializer(
        ride,
        context={"request": request},
    )
    return Response({"ride": serializer.data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ride_detail(request, ride_id):
    ride = get_object_or_404(Ride, id=ride_id)

    if not request.user.is_staff and ride.rider_id != request.user.id and ride.driver_id != request.user.id:
        return Response(
            {"detail": "You do not have access to this ride."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = RideSerializer(
        ride,
        context={"request": request},
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_rides(request):
    rides = Ride.objects.filter(
        driver=request.user,
    ).order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_ride(request, ride_id):
    from django.db import transaction

    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    # Driver must be online/available to accept rides
    profile = DriverProfile.objects.filter(user=request.user).first()
    if profile and not profile.is_available:
        return Response(
            {"detail": "You must be online to accept ride requests."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        ride = get_object_or_404(Ride.objects.select_for_update(), id=ride_id)

        if request.user.city_id and ride.city_id and request.user.city_id != ride.city_id:
            return Response(
                {"detail": "This ride belongs to a different city."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if ride.status != "requested":
            return Response(
                {"detail": "This ride is no longer available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.driver is not None:
            return Response(
                {"detail": "Ride already accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.offered_driver_id and ride.offered_driver_id != request.user.id:
            return Response(
                {"detail": "This ride offer was assigned to another driver."},
                status=status.HTTP_403_FORBIDDEN,
            )

        active_driver_ride = (
            Ride.objects.filter(driver=request.user, status__in=DRIVER_ACTIVE_STATUSES)
            .exclude(id=ride.id)
            .order_by("-id")
            .first()
        )

        if active_driver_ride:
            return Response(
                {
                    "detail": (
                        "Finish your current active ride before accepting another request."
                    ),
                    "ride_id": active_driver_ride.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride.driver = request.user
        ride.status = "driver_arriving"
        ride.offered_driver = None
        ride.offer_sent_at = None
        ride.dispatch_status = "assigned"
        ride.save()

        if profile:
            from taxi.drivers.services.ride_performance_service import record_ride_accepted

            record_ride_accepted(profile)

        from taxi.rides.services.ride_assignment_service import mark_dispatch_assigned

        mark_dispatch_assigned(ride, request.user)

    # Cancel the timeout since the driver accepted
    cancel_ride_request_timeout(ride.id)

    broadcast_ride_update(ride)

    # Push notification to rider
    try:
        notify_ride_accepted(ride.rider, ride)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decline_ride(request, ride_id):
    error = approved_driver_error(request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

    ride = get_object_or_404(Ride, id=ride_id)

    if ride.status != "requested":
        return Response(
            {"detail": "This ride is no longer available."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if ride.offered_driver_id and ride.offered_driver_id != request.user.id:
        return Response(
            {"detail": "This ride offer was assigned to another driver."},
            status=status.HTTP_403_FORBIDDEN,
        )

    from taxi.rides.services.ride_assignment_service import handle_driver_decline

    reassigned = handle_driver_decline(ride, request.user)

    profile = DriverProfile.objects.filter(user=request.user).first()
    penalty = None
    if profile:
        from taxi.drivers.services.ride_performance_service import (
            get_driver_performance_snapshot,
        )

        penalty = get_driver_performance_snapshot(profile)

    return Response(
        {
            "detail": "Ride offer declined.",
            "ride_id": ride.id,
            "reassigned": reassigned,
            "performance": penalty,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def arrived_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    if ride.status not in ("driver_arriving", "accepted"):
        return Response(
            {"detail": "Ride can only be marked arrived when driver is arriving."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if ride.status == "accepted":
        with transaction.atomic():
            locked = Ride.objects.select_for_update().get(pk=ride.id, driver=request.user)
            if locked.status == "accepted":
                locked.status = "driver_arriving"
                locked.save(update_fields=["status"])
                ride = locked
            elif locked.status == "driver_arriving":
                ride = locked
            else:
                return Response(
                    {"detail": "Ride can only be marked arrived when driver is arriving."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    # Required GPS check. Keep this aligned with the driver app arrive gate.
    raw_lat = request.data.get("lat", request.data.get("driver_lat"))
    raw_lng = request.data.get("lng", request.data.get("driver_lng"))
    if raw_lat is None or raw_lng is None:
        return Response(
            {"detail": "Waiting for your location. Please enable GPS and try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from taxi.rides.services.no_show_service import _parse_geo_coord

    driver = _parse_geo_coord(raw_lat, raw_lng)
    if not driver:
        return Response(
            {"detail": "Invalid driver GPS coordinates."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    lat, lng = driver

    pickup = _parse_geo_coord(ride.pickup_lat, ride.pickup_lng)
    if not pickup:
        return Response(
            {"detail": "Invalid pickup coordinates for ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    distance_m = distance_to_pickup_m(ride, lat, lng)
    max_m = arrive_max_distance_m()

    logger = logging.getLogger(__name__)
    logger.warning(
        "ARRIVE_GEOFENCE_CHECK ride_id=%s driver_lat=%s driver_lng=%s "
        "pickup_lat=%s pickup_lng=%s calculated_distance_m=%s max_allowed_m=%s",
        ride.id,
        lat,
        lng,
        pickup[0],
        pickup[1],
        distance_m,
        max_m,
    )

    if distance_m is None or not math.isfinite(distance_m):
        return Response(
            {"detail": "Unable to calculate distance to pickup. Please check your GPS and try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    gps_fallback = str(request.data.get("gps_fallback", "")).lower() in ("true", "1", "yes")

    if distance_m > max_m:
        if gps_fallback:
            logger.warning(
                "ARRIVE_GPS_FALLBACK ride_id=%s driver_lat=%s driver_lng=%s "
                "pickup_lat=%s pickup_lng=%s distance_m=%s max_m=%s "
                "(GPS unavailable on device; pickup coords used as fallback)",
                ride.id, lat, lng, pickup[0], pickup[1], distance_m, max_m,
            )
        else:
            return Response(
                {
                    "detail": (
                        f"Move closer to the pickup point before tapping Arrived "
                        f"({int(distance_m)}m away, max {int(max_m)}m)."
                    ),
                    "distance_m": round(distance_m, 1),
                    "max_distance_m": max_m,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    with transaction.atomic():
        ride = Ride.objects.select_for_update().get(pk=ride.id, driver=request.user)
        if ride.status not in ("driver_arriving", "accepted"):
            return Response(
                {"detail": "Ride can only be marked arrived when driver is arriving."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ride.status == "driver_arrived":
            serializer = RideSerializer(ride, context={"request": request})
            return Response(serializer.data)
        ride.status = "driver_arrived"
        ride.driver_arrived_at = now()
        ride.save(update_fields=["status", "driver_arrived_at"])
    broadcast_ride_update(ride)

    # Push notification to rider
    try:
        notify_driver_arrived(ride.rider, ride)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


def _check_ride_pickup_pin(ride, ride_id, user, submitted_pin):
    """Validate pickup PIN and return an error Response, or None if valid."""
    pin_identity = f"ride:{ride_id}:user:{user.id}"
    lockout = pin_lockout_retry("ride-pickup-pin", pin_identity)
    if lockout:
        return Response(
            {"detail": "Too many incorrect PIN attempts. Try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(lockout)},
        )

    if not submitted_pin:
        return Response(
            {"detail": "Enter the rider's 4-digit pickup PIN."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not secrets.compare_digest(submitted_pin, ride.pickup_pin):
        retry = record_pin_failure("ride-pickup-pin", pin_identity)
        if retry:
            try:
                from security.services.fraud_service import flag_pin_bruteforce
                flag_pin_bruteforce(user, "ride-pickup-pin")
            except Exception:
                logging.getLogger(__name__).exception("PIN bruteforce fraud flag failed")
            return Response(
                {"detail": "Too many incorrect PIN attempts. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry)},
            )
        return Response(
            {"detail": "Incorrect pickup PIN. Ask the rider to confirm the PIN."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_pickup_pin(request, ride_id):
    """Verify rider pickup PIN without starting the trip."""
    with transaction.atomic():
        ride = get_object_or_404(
            Ride.objects.select_for_update(),
            id=ride_id,
            driver=request.user,
        )

        if ride.status == "in_progress":
            return Response(
                {"detail": "Pickup PIN expired. The ride has already started."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.status != "driver_arrived":
            return Response(
                {"detail": "PIN can only be verified after the driver arrives."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.pickup_pin_verified_at:
            try:
                from security.services.audit_service import log_from_request

                log_from_request(
                    request,
                    action="ride_pickup_pin_reverify_ignored",
                    entity_type="ride",
                    entity_id=ride.id,
                    summary=f"Driver re-submitted PIN for already-verified ride #{ride.id}",
                )
            except Exception:
                logging.getLogger(__name__).exception("PIN audit log failed")
            serializer = RideSerializer(ride, context={"request": request})
            return Response(serializer.data)

        submitted_pin = str(request.data.get("pickup_pin", "")).strip()
        pin_error = _check_ride_pickup_pin(ride, ride_id, request.user, submitted_pin)
        if pin_error:
            try:
                from security.services.audit_service import log_from_request

                log_from_request(
                    request,
                    action="ride_pickup_pin_failed",
                    entity_type="ride",
                    entity_id=ride.id,
                    summary=f"Incorrect pickup PIN for ride #{ride.id}",
                    details={"submitted_length": len(submitted_pin)},
                )
            except Exception:
                logging.getLogger(__name__).exception("PIN audit log failed")
            return pin_error

        ride.pickup_pin_verified_at = now()
        ride.save(update_fields=["pickup_pin_verified_at"])

    broadcast_ride_update(ride)
    try:
        from security.services.audit_service import log_from_request

        log_from_request(
            request,
            action="ride_pickup_pin_verified",
            entity_type="ride",
            entity_id=ride.id,
            summary=f"Pickup PIN verified for ride #{ride.id}",
        )
    except Exception:
        logging.getLogger(__name__).exception("PIN audit log failed")

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_ride(request, ride_id):
    with transaction.atomic():
        ride = get_object_or_404(
            Ride.objects.select_for_update(),
            id=ride_id,
            driver=request.user,
        )

        if ride.status in ("in_progress", "completed"):
            serializer = RideSerializer(ride, context={"request": request})
            return Response(serializer.data)

        if ride.status != "driver_arrived":
            return Response(
                {"detail": "Ride can only be started after driver arrives."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not ride.pickup_pin_verified_at:
            return Response(
                {"detail": "Verify the rider pickup PIN before starting the ride."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride.status = "in_progress"

        waiting_fee = Decimal("0")
        if ride.driver_arrived_at:
            waited_seconds = int((now() - ride.driver_arrived_at).total_seconds())
            waiting_fee = calculate_waiting_fee(waited_seconds, ride=ride)

        ride.waiting_fee = waiting_fee
        if waiting_fee > 0:
            ride.fare = ride.fare + waiting_fee
            snapshot = getattr(ride, "pricing_snapshot", None)
            commission_percent = (
                snapshot.commission_percent if snapshot else None
            )
            from app_settings.pricing_service import calculate_ride_app_fee

            ride.app_fee = calculate_ride_app_fee(ride.fare, commission_percent)
            ride.driver_earning = ride.fare - ride.app_fee

        ride.save(update_fields=["status", "waiting_fee", "fare", "app_fee", "driver_earning"])

    # Return immediately so the driver app never times out / gets 503 while side
    # effects (WS broadcast, push, audit) run.
    serializer = RideSerializer(ride, context={"request": request})
    response = Response(serializer.data)

    ride_id = ride.id
    waiting_fee = str(ride.waiting_fee)
    request_for_audit = request

    def _post_start_side_effects():
        try:
            fresh = Ride.objects.select_related("rider", "driver").get(id=ride_id)
        except Ride.DoesNotExist:
            return
        try:
            broadcast_ride_update(fresh)
        except Exception:
            logging.getLogger(__name__).exception(
                "Start ride broadcast failed ride=%s", ride_id
            )
        try:
            from security.services.audit_service import log_from_request

            log_from_request(
                request_for_audit,
                action="ride_started",
                entity_type="ride",
                entity_id=ride_id,
                summary=f"Ride #{ride_id} started after PIN verification",
                details={"waiting_fee": waiting_fee},
            )
        except Exception:
            logging.getLogger(__name__).exception("Start ride audit log failed")
        try:
            notify_ride_started(fresh.rider, fresh)
        except Exception:
            pass

    _run_in_background(_post_start_side_effects)
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_ride(request, ride_id):
    with transaction.atomic():
        ride = get_object_or_404(
            Ride.objects.select_for_update(),
            id=ride_id,
            driver=request.user,
        )

        if ride.status == "completed":
            return Response(
                {"detail": "Ride can only be completed while in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.status != "in_progress":
            return Response(
                {"detail": "Ride can only be completed while in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unfinished_stop = (
            ride.stops.filter(departed_at__isnull=True)
            .order_by("stop_order")
            .first()
        )
        if unfinished_stop:
            return Response(
                {
                    "detail": (
                        f"Complete stop #{unfinished_stop.stop_order} before "
                        "completing the ride."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride.status = "completed"
        ride.completed_at = now()
        ride.save(update_fields=["status", "completed_at"])

        # Capture while the ride row is locked to avoid double-capture races.
        try:
            captured_payment = capture_ride_payment(ride)
            if not captured_payment:
                calculate_money(ride)
        except Exception:
            logger.exception(
                "Payment capture failed for ride=%s; completing anyway", ride.id
            )

    serializer = RideSerializer(ride, context={"request": request})
    response = Response(serializer.data)

    ride_id = ride.id

    def _post_complete_side_effects():
        try:
            fresh = Ride.objects.select_related("rider", "driver").get(id=ride_id)
        except Ride.DoesNotExist:
            return

        try:
            broadcast_ride_update(fresh)
        except Exception:
            logger.exception("Complete ride broadcast failed ride=%s", ride_id)

        try:
            if fresh.referral_code:
                rider = fresh.rider
                completed_count = Ride.objects.filter(
                    rider=rider, status="completed"
                ).count()
                if completed_count == 1:
                    service = PromoCodeService()
                    referral_result = service.apply_referral(
                        fresh.referral_code, rider, fresh, fresh.fare
                    )
                    if referral_result.success and referral_result.referee_discount > 0:
                        from payments.models import Payment

                        discount = min(referral_result.referee_discount, fresh.fare)
                        final_fare = max(fresh.fare - discount, Decimal("0.00"))
                        payment = Payment.objects.filter(
                            ride_id=fresh.id,
                            status__in=["authorized", "paid"],
                        ).order_by("-created_at").first()
                        if payment:
                            payment.discount_amount = discount
                            payment.amount = final_fare
                            payment.save(update_fields=["discount_amount", "amount"])
        except Exception:
            logger.exception("Referral application failed for ride=%s", ride_id)

        try:
            from features.corporate_service import record_corporate_ride_completion

            record_corporate_ride_completion(fresh)
        except Exception:
            logger.exception("Corporate ride accounting failed for ride=%s", ride_id)

        if fresh.driver:
            try:
                from taxi.drivers.models import DriverProfile as _DP
                from taxi.drivers.services.ride_performance_service import (
                    record_ride_completed as _rec_completed,
                    notify_driver_level_up as _notify_level_up,
                )
                from taxi.drivers.services.level_service import DriverLevelService as _LvlSvc

                _dp = _DP.objects.filter(user=fresh.driver).first()
                if _dp:
                    _prev_level = _dp.driver_level
                    _rec_completed(_dp)
                    _dp.refresh_from_db(fields=["total_rides_completed"])
                    _new_level = _LvlSvc().evaluate_level(_dp)
                    if _new_level != _prev_level:
                        _dp.driver_level = _new_level
                        _dp.save(update_fields=["driver_level"])
                        _notify_level_up(_dp, _new_level)
                    from taxi.drivers.services.rewards_service import RewardsService

                    RewardsService().on_ride_completed(fresh, _dp)
                    try:
                        from incentives.services.ride_incentives import track_ride_completion

                        track_ride_completion(fresh.driver, fresh)
                    except Exception:
                        logger.exception("Incentive tracking failed ride=%s", ride_id)
            except Exception:
                logger.exception(
                    "Failed to update driver performance counters ride=%s", ride_id
                )

        try:
            notify_ride_completed(fresh.rider, fresh)
            if fresh.driver:
                notify_payment_completed(fresh.driver, fresh)
        except Exception:
            pass

    _run_in_background(_post_complete_side_effects)
    return response



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def record_rider_call_attempt(request, ride_id):
    """Log an in-app Call Rider tap by the assigned driver."""
    ride = get_object_or_404(Ride, id=ride_id)
    if ride.driver_id != request.user.id:
        return Response(
            {"detail": "Only the assigned driver can log rider call attempts."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if ride.status not in ("driver_arriving", "driver_arrived"):
        return Response(
            {"detail": "Call attempts can only be logged while arriving or waiting at pickup."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    stamp = now()
    attempts = list(ride.rider_call_attempts or [])
    attempts.append({"at": stamp.isoformat(), "by_user_id": request.user.id})
    attempts = attempts[-20:]
    ride.rider_call_attempts = attempts
    ride.rider_call_attempt_count = len(attempts)
    ride.rider_call_last_at = stamp
    ride.save(
        update_fields=[
            "rider_call_attempts",
            "rider_call_attempt_count",
            "rider_call_last_at",
        ]
    )
    return Response(
        {
            "ride_id": ride.id,
            "call_attempts": ride.rider_call_attempt_count,
            "rider_call_last_at": stamp.isoformat(),
            "status": ride.status,
        }
    )


def _parse_optional_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_ride(request, ride_id):
    ride = get_object_or_404(Ride, id=ride_id)

    if (
        ride.rider_id != request.user.id
        and ride.driver_id != request.user.id
        and not request.user.is_staff
    ):
        return Response(
            {"detail": "Only the rider, assigned driver, or admin can cancel this ride."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if ride.status in ("cancelled", "rider_no_show"):
        return Response(
            {"detail": "This ride has already been cancelled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if ride.status in ["in_progress", "completed"]:
        return Response(
            {"detail": "Ride can only be cancelled before the trip starts."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cancellation_reason = str(request.data.get("reason", "")).strip()
    cancellation_reason_details = str(request.data.get("reason_details", "")).strip()
    if not cancellation_reason:
        return Response(
            {"detail": "Cancellation reason is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if cancellation_reason.lower() == "other" and len(cancellation_reason_details) < 10:
        return Response(
            {"detail": "Please provide at least 10 characters when selecting Other."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Determine who is cancelling
    penalty = None
    penalty_waived = False
    is_rider_no_show = False
    waiver_details = {}
    no_show_fee = Decimal("0")
    driver_compensation = Decimal("0")
    if request.user.is_staff:
        cancelled_by = "admin"
    elif ride.rider_id == request.user.id:
        cancelled_by = "rider"
    else:
        cancelled_by = "driver"

    driver_lat = _parse_optional_float(
        request.data.get("lat", request.data.get("driver_lat"))
    )
    driver_lng = _parse_optional_float(
        request.data.get("lng", request.data.get("driver_lng"))
    )
    device_id = str(request.data.get("device_id") or "").strip()[:120]

    # Calculate cancellation fee / Lyft-style rider no-show
    from app_settings.pricing_service import (
        get_ride_cancellation_policy,
        get_ride_waiting_policy,
    )

    cancellation_fee = Decimal("0")

    cancellation_cfg = get_ride_cancellation_policy(ride)
    waiting_cfg = get_ride_waiting_policy(ride)
    free_window_seconds = int(cancellation_cfg["free_window_minutes"]) * 60
    en_route_fee = Decimal(str(cancellation_cfg["en_route_fee"]))
    arrived_fee = Decimal(str(cancellation_cfg["arrived_fee"]))
    driver_penalty = Decimal(str(cancellation_cfg["driver_penalty"]))
    free_wait_seconds = int(waiting_cfg["free_minutes"]) * 60

    if cancelled_by == "rider" and ride.driver is not None:
        created_seconds_ago = (now() - ride.created_at).total_seconds()
        if created_seconds_ago <= free_window_seconds:
            cancellation_fee = Decimal("0")
        elif ride.status == "driver_arrived":
            waited = 0
            if ride.driver_arrived_at:
                waited = (now() - ride.driver_arrived_at).total_seconds()
            if waited > free_wait_seconds:
                cancellation_fee = arrived_fee
            else:
                cancellation_fee = en_route_fee
        elif ride.status in ["accepted", "driver_arriving"]:
            cancellation_fee = en_route_fee
        else:
            cancellation_fee = en_route_fee
    elif cancelled_by == "driver" and ride.status in ["driver_arriving", "driver_arrived"]:
        wants_no_show = is_no_show_reason(cancellation_reason)
        if wants_no_show:
            eligible, waiver_details = evaluate_no_show_eligibility(
                ride,
                cancellation_reason,
                driver_lat=driver_lat,
                driver_lng=driver_lng,
            )
            if not eligible:
                block = waiver_details.get("block_reason")
                messages = {
                    "must_arrive_first": "Tap Arrived at pickup before marking rider no-show.",
                    "max_wait_not_reached": (
                        "Rider no-show unlocks only after the max wait timer ends."
                    ),
                    "gps_required": "Send your current GPS location to confirm you are at pickup.",
                    "too_far_from_pickup": (
                        "You must be near the pickup point to mark rider no-show."
                    ),
                }
                return Response(
                    {
                        "detail": messages.get(block, "Rider no-show is not allowed yet."),
                        "block_reason": block,
                        "no_show": waiver_details,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            fee_policy = get_no_show_fee_policy(ride)
            no_show_fee = fee_policy["rider_fee"]
            driver_compensation = fee_policy["driver_compensation"]
            cancellation_fee = no_show_fee  # charged to rider, not driver
            penalty_waived = True
            is_rider_no_show = True
            cancellation_reason = CANONICAL_NO_SHOW_REASON
        else:
            cancellation_fee = driver_penalty  # driver-side cancel penalty

    stamp = now()
    with transaction.atomic():
        ride = Ride.objects.select_for_update().get(pk=ride.id)
        if ride.status in ("cancelled", "rider_no_show"):
            return Response(
                {"detail": "This ride has already been cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ride.status in ["in_progress", "completed"]:
            return Response(
                {"detail": "Ride can only be cancelled before the trip starts."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pre_cancel_status = ride.status
        ride.status = "rider_no_show" if is_rider_no_show else "cancelled"
        ride.cancelled_at = stamp
        # Keep cancelled_by as the actor who submitted; no-show is flagged via status/is_rider_no_show.
        ride.cancelled_by = cancelled_by
        ride.cancellation_reason = cancellation_reason
        ride.cancellation_reason_details = cancellation_reason_details
        ride.cancellation_fee = cancellation_fee
        ride.is_rider_no_show = is_rider_no_show
        ride.no_show_fee = no_show_fee
        ride.no_show_driver_compensation = driver_compensation
        update_fields = [
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "cancellation_reason_details",
            "cancellation_fee",
            "is_rider_no_show",
            "no_show_fee",
            "no_show_driver_compensation",
            "no_show_evidence",
            "no_show_at",
        ]
        if is_rider_no_show:
            ride.no_show_at = stamp
            ride.driver_earning = driver_compensation
            ride.no_show_evidence = {
                "at": stamp.isoformat(),
                "driver_user_id": request.user.id,
                "device_id": device_id,
                "driver_lat": driver_lat,
                "driver_lng": driver_lng,
                "pickup_lat": ride.pickup_lat,
                "pickup_lng": ride.pickup_lng,
                "distance_to_pickup_m": waiver_details.get("distance_to_pickup_m"),
                "waited_seconds": waiver_details.get("waited_seconds"),
                "max_wait_seconds": waiver_details.get("max_wait_seconds"),
                "free_wait_seconds": waiver_details.get("free_wait_seconds"),
                "call_attempts": waiver_details.get("call_attempts"),
                "user_agent": str(request.META.get("HTTP_USER_AGENT", ""))[:255],
            }
            update_fields.append("driver_earning")
        ride.save(update_fields=update_fields)

    if cancelled_by == "driver" or is_rider_no_show:
        DriverProfile.objects.filter(user=ride.driver or request.user).update(is_available=True)
        driver_profile = DriverProfile.objects.filter(
            user=ride.driver or request.user
        ).first()
        accepted_statuses = {"driver_arriving", "driver_arrived"}
        ride_was_accepted = bool(
            ride.driver_id
            and ride.driver_id == request.user.id
            and pre_cancel_status in accepted_statuses
        )
        if driver_profile and not penalty_waived and ride_was_accepted:
            from taxi.drivers.services.ride_performance_service import (
                apply_driver_cancellation_penalty,
            )
            penalty = apply_driver_cancellation_penalty(driver_profile)
            try:
                from taxi.drivers.services.rewards_service import RewardsService

                RewardsService().on_driver_cancellation(driver_profile, ride)
            except Exception:
                logger.exception("Failed to deduct reward points on cancel ride=%s", ride.id)
        elif penalty_waived and driver_profile:
            from taxi.drivers.services.ride_performance_service import (
                record_driver_no_show,
            )
            record_driver_no_show(driver_profile)
        if penalty_waived:
            logger.info(
                "Rider no-show: driver=%s ride=%s waited=%s distance_m=%s fee=%s comp=%s",
                request.user.id,
                ride.id,
                waiver_details.get("waited_seconds"),
                waiver_details.get("distance_to_pickup_m"),
                no_show_fee,
                driver_compensation,
            )
            if driver_compensation > 0 and ride.driver_id:
                try:
                    from payments.wallet_ledger import (
                        apply_wallet_transaction,
                        get_or_create_wallet,
                    )

                    wallet = get_or_create_wallet(ride.driver)
                    apply_wallet_transaction(
                        wallet,
                        driver_compensation,
                        is_credit=True,
                        transaction_type="no_show",
                        reference=f"ride:{ride.id}:no_show",
                        note=f"Rider no-show compensation for ride #{ride.id}",
                    )
                except Exception:
                    logger.exception(
                        "Failed to credit no-show compensation ride=%s driver=%s",
                        ride.id,
                        ride.driver_id,
                    )
    else:
        penalty = None

    if is_rider_no_show and ride.rider_id:
        try:
            from security.services.fraud_service import check_excessive_cancellations

            check_excessive_cancellations(ride.rider)
        except Exception:
            logger.warning("Could not run rider fraud check after no-show cancel ride=%s", ride.id)

    # Cancel any active timeout timer for this ride
    cancel_ride_request_timeout(ride.id)

    cancel_ride_payment(ride)
    broadcast_ride_update(ride)

    # Cancellation abuse detection — flag riders/drivers with > 3 cancels/24h
    # Valid rider no-show completions by the driver are exempt from driver abuse.
    if cancelled_by in ("rider", "driver") and not penalty_waived:
        is_abuse = record_cancellation(request.user.id)
        if is_abuse:
            try:
                from security.models import FraudFlag
                FraudFlag.objects.get_or_create(
                    user=request.user,
                    reason="excessive_cancellations",
                    status="open",
                    defaults={
                        "severity": "medium",
                        "description": f"{cancelled_by.title()} exceeded 3 ride cancellations in 24 hours.",
                    },
                )
            except Exception:
                logger.warning("Could not create FraudFlag for excessive cancellations: user=%s", request.user.id)

    # Push notification to the other party
    try:
        notify_ride_cancelled(request.user, ride, cancelled_by)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    data = serializer.data
    data["cancellation_reason"] = cancellation_reason
    data["cancellation_reason_details"] = cancellation_reason_details
    data["cancelled_by"] = ride.cancelled_by
    data["cancellation_fee"] = str(cancellation_fee)
    data["penalty_waived"] = penalty_waived
    data["is_rider_no_show"] = is_rider_no_show
    data["no_show_fee"] = str(no_show_fee)
    data["no_show_driver_compensation"] = str(driver_compensation)
    data["no_show_at"] = ride.no_show_at.isoformat() if ride.no_show_at else None
    data["call_attempts"] = int(getattr(ride, "rider_call_attempt_count", 0) or 0)
    data["waited_seconds"] = waiver_details.get("waited_seconds") if waiver_details else None
    if is_rider_no_show:
        data["refund_status"] = (
            f"Rider no-show fee: {no_show_fee} MRU; "
            f"driver compensation: {driver_compensation} MRU"
        )
    else:
        data["refund_status"] = (
            "Authorization released"
            if cancellation_fee == 0
            else f"Cancellation fee: {cancellation_fee} MRU"
        )
    if penalty:
        data["driver_performance"] = penalty
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        rider=request.user,
    )

    if ride.status != "completed":
        return Response(
            {"detail": "Only completed rides can be rated."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rating = request.data.get("rating")
    review = request.data.get("review", "")

    if not rating:
        return Response(
            {"detail": "Rating is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.rating = rating
    ride.review = review
    ride.save()

    if ride.driver_id:
        try:
            from taxi.drivers.models import DriverProfile
            from taxi.drivers.services.rewards_service import RewardsService

            profile = DriverProfile.objects.filter(user_id=ride.driver_id).first()
            if profile:
                RewardsService().on_ride_rated(ride, profile, int(rating))
        except Exception:
            logger.exception("Failed to apply rating rewards ride=%s", ride.id)

    serializer = RideSerializer(ride, context={"request": request})

    return Response(
        {
            "message": "Rating submitted successfully",
            "ride": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_rider(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    if ride.status != "completed":
        return Response(
            {"detail": "Only completed rides can be rated."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rating = request.data.get("rating")
    review = request.data.get("review", "")

    if not rating:
        return Response(
            {"detail": "Rating is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        rating_value = int(rating)
    except (TypeError, ValueError):
        return Response(
            {"detail": "Rating must be a number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if rating_value < 1 or rating_value > 5:
        return Response(
            {"detail": "Rating must be between 1 and 5."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.driver_rating = rating_value
    ride.driver_review = review
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})

    return Response(
        {
            "message": "Rider rating submitted successfully",
            "ride": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_earnings_summary(request):
    driver = request.user

    completed_rides = Ride.objects.filter(
        driver=driver,
        status="completed",
    )

    today = timezone.localdate()

    today_rides = completed_rides.filter(
        completed_at__date=today,
    )

    today_earnings = today_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    week_start = today - timedelta(days=today.weekday())
    week_rides = completed_rides.filter(
        completed_at__date__gte=week_start,
    )

    week_earnings = week_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    month_start = today.replace(day=1)
    month_rides = completed_rides.filter(
        completed_at__date__gte=month_start,
    )

    month_earnings = month_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    year_start = today.replace(month=1, day=1)
    year_rides = completed_rides.filter(
        completed_at__date__gte=year_start,
    )

    year_earnings = year_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    total_earnings = completed_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    def sum_for_range(start_date, end_date):
        return completed_rides.filter(
            completed_at__date__gte=start_date,
            completed_at__date__lte=end_date,
        ).aggregate(total=Sum("driver_earning"))["total"] or 0

    daily_chart = []
    for days_ago in range(6, -1, -1):
        day = today - timedelta(days=days_ago)
        daily_chart.append(
            {
                "label": day.strftime("%a"),
                "date": day.isoformat(),
                "earnings": float(sum_for_range(day, day)),
            }
        )

    weekly_chart = []
    for weeks_ago in range(3, -1, -1):
        start = week_start - timedelta(days=weeks_ago * 7)
        end = start + timedelta(days=6)
        weekly_chart.append(
            {
                "label": f"{start.strftime('%b')} {start.day}",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "earnings": float(sum_for_range(start, end)),
            }
        )

    monthly_chart = []
    month_cursor = today.replace(day=1)
    for months_ago in range(5, -1, -1):
        month = month_cursor
        for _ in range(months_ago):
            month = (month.replace(day=1) - timedelta(days=1)).replace(day=1)

        next_month = (
            month.replace(year=month.year + 1, month=1, day=1)
            if month.month == 12
            else month.replace(month=month.month + 1, day=1)
        )
        end = next_month - timedelta(days=1)
        monthly_chart.append(
            {
                "label": month.strftime("%b"),
                "start_date": month.isoformat(),
                "end_date": end.isoformat(),
                "earnings": float(sum_for_range(month, end)),
            }
        )

    try:
        from payments.views import driver_withdrawal_balance

        withdrawable_balance = driver_withdrawal_balance(driver)
    except Exception:
        withdrawable_balance = total_earnings

    return Response(
        {
            "today_earnings": float(today_earnings),
            "week_earnings": float(week_earnings),
            "month_earnings": float(month_earnings),
            "year_earnings": float(year_earnings),
            "total_earnings": float(total_earnings),
            "withdrawable_balance": float(withdrawable_balance),
            "completed_rides": completed_rides.count(),
            "today_completed_rides": today_rides.count(),
            "earnings_date": today.isoformat(),
            "charts": {
                "daily": daily_chart,
                "weekly": weekly_chart,
                "monthly": monthly_chart,
            },
        },
        status=status.HTTP_200_OK,
    )
