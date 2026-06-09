from datetime import timedelta
from decimal import Decimal
import secrets

from django.shortcuts import get_object_or_404
from django.db.models import Sum
from django.db import transaction
from django.utils.timezone import now

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from taxi.market import MARKET, calculate_app_fee, calculate_fare
from payments.services import (
    authorize_ride_payment,
    cancel_ride_payment,
    capture_ride_payment,
)
from promotions.services import PromoCodeService
from taxi.drivers.models import DriverProfile
from taxi.security.abuse import rate_limit, validate_coordinates
from locations.services import calculate_city_fare, resolve_city

from .models import Ride, RideStop
from .serializers import RideSerializer
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


def broadcast_ride_update(ride):
    """Send a ride status update to all connected WebSocket clients."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "rides",
            {
                "type": "ride_update",
                "message": {
                    "ride_id": ride.id,
                    "status": ride.status,
                    "rider_id": ride.rider_id,
                    "driver_id": ride.driver_id,
                },
            },
        )
    except Exception:
        pass  # Don't break the request if channel layer is unavailable


OPEN_RIDE_STATUSES = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"]
DRIVER_ACTIVE_STATUSES = ["driver_arriving", "driver_arrived", "in_progress"]


def approved_driver_error(user):
    if getattr(user, "user_type", "") != "driver":
        return "Only driver accounts can view or accept ride requests."

    if not user.is_phone_verified:
        return "Verify your phone number before viewing or accepting ride requests."

    if not DriverProfile.objects.filter(user=user, status="approved").exists():
        return "Your driver application must be approved before viewing or accepting rides."

    return ""


def calculate_money(ride):
    fare = ride.fare or 0
    app_fee = calculate_app_fee(fare)
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

    if getattr(request.user, "rider_status", "approved") != "approved":
        return Response(
            {"detail": "Rider account must be approved by admin before requesting a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.is_phone_verified:
        return Response(
            {"detail": "Verify your phone number before requesting a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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

    if not request.user.profile_picture:
        return Response(
            {"detail": "Rider profile photo is required before requesting a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.phone_number:
        return Response(
            {"detail": "Rider phone number is required before requesting a ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        distance_km = Decimal(str(request.data.get("distance_km", request.data.get("distance", 0))))
        if distance_km < Decimal("0.1") or distance_km > Decimal("200"):
            raise ValueError("Ride distance must be between 0.1 and 200 km.")
        pickup_lat, pickup_lng = validate_coordinates(
            request.data.get("pickup_lat", MARKET["default_pickup_lat"]),
            request.data.get("pickup_lng", MARKET["default_pickup_lng"]),
        )
        destination_lat, destination_lng = validate_coordinates(
            request.data.get("destination_lat", MARKET["default_destination_lat"]),
            request.data.get("destination_lng", MARKET["default_destination_lng"]),
        )
    except (ValueError, TypeError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    ride_type = request.data.get("ride_type", "regular")
    city = resolve_city(
        city_id=request.data.get("city"),
        city_slug=request.data.get("city_slug"),
        fallback_user=request.user,
    )
    fare = calculate_city_fare(city, ride_type, distance_km)

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
                status="requested",
                referral_code=referral_code,
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

    authorize_ride_payment(ride, discount_amount=discount_amount)
    broadcast_ride_update(ride)

    # Start the 30-second timeout countdown for ride acceptance
    start_ride_request_timeout(ride.id, driver_user_id=None)

    # Push notification to all available drivers
    try:
        notify_new_ride_request_to_drivers(ride)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def schedule_ride(request):
    """Schedule a ride for a future time."""
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
    ride_type = request.data.get("ride_type", "regular")
    city = resolve_city(
        city_id=request.data.get("city"),
        city_slug=request.data.get("city_slug"),
        fallback_user=request.user,
    )
    fare = calculate_city_fare(city, ride_type, distance_km)

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
                status="scheduled",
                scheduled_at=scheduled_time,
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
    )
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
        rides = Ride.objects.all().order_by("-id")
        city_id = request.query_params.get("city")
        if city_id:
            rides = rides.filter(city_id=city_id)
    else:
        rides = Ride.objects.filter(
            rider=request.user,
        ).order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
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

    ride = get_object_or_404(Ride, id=ride_id)

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
    ride.save()

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
def arrived_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    if ride.status != "driver_arriving":
        return Response(
            {"detail": "Ride can only be marked arrived when driver is arriving."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    if ride.status != "driver_arrived":
        return Response(
            {"detail": "Ride can only be started after driver arrives."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    submitted_pin = str(request.data.get("pickup_pin", "")).strip()
    if not submitted_pin:
        return Response(
            {"detail": "Enter the rider's 4-digit pickup PIN before starting the ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not secrets.compare_digest(submitted_pin, ride.pickup_pin):
        return Response(
            {"detail": "Incorrect pickup PIN. Ask the rider to confirm the PIN."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.status = "in_progress"
    ride.pickup_pin_verified_at = now()

    # Calculate waiting fee: free for 3 min, then charge per minute (max 5 min charged)
    waiting_fee = Decimal("0")
    if ride.driver_arrived_at:
        waited_seconds = (now() - ride.driver_arrived_at).total_seconds()
        free_wait_seconds = 3 * 60  # 3 minutes free
        max_charged_seconds = 5 * 60  # max 5 minutes charged
        per_minute_fee = Decimal("50")  # 50 MRU per minute

        if waited_seconds > free_wait_seconds:
            chargeable_seconds = min(
                waited_seconds - free_wait_seconds,
                max_charged_seconds
            )
            chargeable_minutes = Decimal(str(chargeable_seconds)) / Decimal("60")
            waiting_fee = (chargeable_minutes * per_minute_fee).quantize(Decimal("0.01"))

    ride.waiting_fee = waiting_fee
    if waiting_fee > 0:
        ride.fare = ride.fare + waiting_fee
        ride.app_fee = calculate_app_fee(ride.fare)
        ride.driver_earning = ride.fare - ride.app_fee

    ride.save(update_fields=["status", "pickup_pin_verified_at", "waiting_fee", "fare", "app_fee", "driver_earning"])
    broadcast_ride_update(ride)

    # Push notification to rider
    try:
        notify_ride_started(ride.rider, ride)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
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

    # Apply referral code if this is the rider's first completed ride
    if ride.referral_code:
        rider = ride.rider
        # Check if this is the rider's first completed ride (only this one exists)
        completed_count = Ride.objects.filter(
            rider=rider, status="completed"
        ).count()
        if completed_count == 1:
            try:
                service = PromoCodeService()
                referral_result = service.apply_referral(
                    ride.referral_code, rider, ride, ride.fare
                )
                # If referral was successfully applied, apply referee discount to fare
                if referral_result.success and referral_result.referee_discount > 0:
                    from decimal import Decimal

                    discount = min(referral_result.referee_discount, ride.fare)
                    final_fare = max(ride.fare - discount, Decimal("0.00"))
                    # Update the payment with the referral discount
                    from payments.models import Payment

                    payment = Payment.objects.filter(
                        ride_id=ride.id,
                        status__in=["authorized", "paid"],
                    ).order_by("-created_at").first()
                    if payment:
                        payment.discount_amount = discount
                        payment.amount = final_fare
                        payment.save(update_fields=["discount_amount", "amount"])
            except Exception:
                # Referral application failure should not block ride completion
                pass

    captured_payment = capture_ride_payment(ride)

    if not captured_payment:
        calculate_money(ride)

    broadcast_ride_update(ride)

    # Push notifications for ride completion
    try:
        notify_ride_completed(ride.rider, ride)
        if ride.driver:
            notify_payment_completed(ride.driver, ride)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


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

    if ride.status in ["in_progress", "completed"]:
        return Response(
            {"detail": "Ride can only be cancelled before the trip starts."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cancellation_reason = request.data.get("reason", "")

    # Determine who is cancelling
    if request.user.is_staff:
        cancelled_by = "admin"
    elif ride.rider_id == request.user.id:
        cancelled_by = "rider"
    else:
        cancelled_by = "driver"

    # Calculate cancellation fee
    # Rider cancellation: fee applies if driver was already assigned and arriving/arrived
    # Driver cancellation: fee applies if rider was already waiting
    cancellation_fee = Decimal("0")

    if cancelled_by == "rider" and ride.driver is not None:
        # Rider cancels after driver accepted — charge rider
        if ride.status in ["driver_arriving", "driver_arrived"]:
            cancellation_fee = Decimal("100")  # 100 MRU cancellation fee
    elif cancelled_by == "driver" and ride.status in ["driver_arriving", "driver_arrived"]:
        # Driver cancels after accepting — charge driver
        cancellation_fee = Decimal("150")  # 150 MRU penalty for driver

    ride.status = "cancelled"
    ride.cancelled_at = now()
    ride.cancelled_by = cancelled_by
    ride.cancellation_reason = cancellation_reason
    ride.cancellation_fee = cancellation_fee
    ride.save(update_fields=[
        "status", "cancelled_at", "cancelled_by",
        "cancellation_reason", "cancellation_fee",
    ])

    # Cancel any active timeout timer for this ride
    cancel_ride_request_timeout(ride.id)

    cancel_ride_payment(ride)
    broadcast_ride_update(ride)

    # Push notification to the other party
    try:
        notify_ride_cancelled(request.user, ride, cancelled_by)
    except Exception:
        pass

    serializer = RideSerializer(ride, context={"request": request})
    data = serializer.data
    data["cancellation_reason"] = cancellation_reason
    data["cancelled_by"] = cancelled_by
    data["cancellation_fee"] = str(cancellation_fee)
    data["refund_status"] = "Authorization released" if cancellation_fee == 0 else f"Cancellation fee: {cancellation_fee} MRU"
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        rider=request.user,
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

    today = now().date()

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
            "total_earnings": float(total_earnings),
            "withdrawable_balance": float(withdrawable_balance),
            "completed_rides": completed_rides.count(),
            "today_completed_rides": today_rides.count(),
            "charts": {
                "daily": daily_chart,
                "weekly": weekly_chart,
                "monthly": monthly_chart,
            },
        },
        status=status.HTTP_200_OK,
    )
