"""
Share Ride API Views — Passenger-facing and driver-facing endpoints.

Task 2.5: Share ride request, detail, cancel, and rate views.
Task 2.7: Share ride session driver-facing views (accept, pickup, dropoff, complete, stops).
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from taxi.rides.models import Ride, ShareRideSession, ShareSessionStop
from taxi.rides.services.matching_service import MatchingService
from taxi.rides.services.pricing_engine import PricingEngine
from taxi.rides.services.ride_status_service import RideStatusService
from taxi.rides.services.route_optimizer import RouteOptimizer

logger = logging.getLogger(__name__)

# ─── Service area boundaries (Nouakchott) ─────────────────────────────────────
SERVICE_AREA_LAT_MIN = 17.9
SERVICE_AREA_LAT_MAX = 18.2
SERVICE_AREA_LNG_MIN = -16.1
SERVICE_AREA_LNG_MAX = -15.8

# ─── Fare constants ───────────────────────────────────────────────────────────
BASE_FARE_MRU = Decimal("50")
PER_KM_FARE_MRU = Decimal("30")
DEFAULT_SIMILARITY_SCORE = 0.7


def _validate_service_area(lat, lng):
    """Return True if coordinates are within Nouakchott service area."""
    return (
        SERVICE_AREA_LAT_MIN <= lat <= SERVICE_AREA_LAT_MAX
        and SERVICE_AREA_LNG_MIN <= lng <= SERVICE_AREA_LNG_MAX
    )


def _get_first_name(user):
    """Extract first name from user."""
    if user.first_name:
        return user.first_name.split()[0]
    return user.email.split("@")[0]


def _build_ride_detail(ride):
    """Build a detailed response dict for a Share ride."""
    data = {
        "id": ride.id,
        "ride_type": ride.ride_type,
        "status": ride.status,
        "share_status": ride.share_status,
        "fare": int(ride.fare) if ride.fare else 0,
        "economy_fare": int(ride.economy_fare) if ride.economy_fare else 0,
        "savings": int(ride.economy_fare - ride.fare) if ride.economy_fare and ride.fare else 0,
        "seats": ride.seats,
        "pickup": ride.pickup,
        "destination": ride.destination,
        "pickup_lat": ride.pickup_lat,
        "pickup_lng": ride.pickup_lng,
        "destination_lat": ride.destination_lat,
        "destination_lng": ride.destination_lng,
        "distance_km": float(ride.distance_km),
        "created_at": ride.created_at.isoformat() if ride.created_at else None,
    }

    # Session info
    if ride.share_session:
        session = ride.share_session
        data["session_id"] = session.id
        data["session_status"] = session.status
        data["passengers_count"] = session.passengers_count

        # Other passengers (first name only)
        other_rides = session.active_rides.exclude(pk=ride.pk).select_related("rider")
        data["other_passengers"] = [
            _get_first_name(r.rider) for r in other_rides
        ]

        # Driver info
        if session.driver:
            driver = session.driver
            driver_data = {
                "name": f"{driver.first_name} {driver.last_name}".strip() or driver.email,
            }
            try:
                profile = driver.driver_profile
                driver_data.update({
                    "vehicle": f"{profile.vehicle_make or ''} {profile.vehicle_model or ''} {profile.vehicle_color or ''}".strip(),
                    "plate_number": profile.plate_number or profile.vehicle_plate or "",
                    "rating": float(profile.average_rating),
                    "photo_url": profile.driver_photo.url if profile.driver_photo else None,
                })
            except Exception:
                pass
            data["driver"] = driver_data
        else:
            data["driver"] = None

        # Stops
        stops = session.stops.all().order_by("stop_order")
        data["stops"] = [
            {
                "type": stop.stop_type,
                "location_name": stop.location_name,
                "lat": stop.latitude,
                "lng": stop.longitude,
                "eta_minutes": stop.eta_minutes,
                "completed": stop.completed_at is not None,
                "ride_id": stop.ride_id,
            }
            for stop in stops
        ]
    else:
        data["session_id"] = None
        data["session_status"] = None
        data["passengers_count"] = 0
        data["other_passengers"] = []
        data["driver"] = None
        data["stops"] = []

    return data


# ═══════════════════════════════════════════════════════════════════════════════
# Task 2.5: Passenger-facing Share Ride Views
# ═══════════════════════════════════════════════════════════════════════════════


class ShareRideRequestView(APIView):
    """
    POST /api/rides/share/request/

    Request a new Share ride. Validates service area, calculates fares,
    creates the ride, and triggers matching.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data

        # Required fields
        pickup = data.get("pickup")
        destination = data.get("destination")
        pickup_lat = data.get("pickup_lat")
        pickup_lng = data.get("pickup_lng")
        destination_lat = data.get("destination_lat")
        destination_lng = data.get("destination_lng")
        seats = data.get("seats", 1)
        distance_km = data.get("distance_km")

        # Validate required fields
        if not all([pickup, destination, pickup_lat, pickup_lng,
                    destination_lat, destination_lng, distance_km]):
            return Response(
                {"error": "All fields are required: pickup, destination, "
                          "pickup_lat, pickup_lng, destination_lat, destination_lng, distance_km"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Parse numeric values
        try:
            pickup_lat = float(pickup_lat)
            pickup_lng = float(pickup_lng)
            destination_lat = float(destination_lat)
            destination_lng = float(destination_lng)
            distance_km = Decimal(str(distance_km))
            seats = int(seats)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid numeric values provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate seats
        if seats not in (1, 2):
            return Response(
                {"error": "Seat count must be 1 or 2"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate service area — pickup
        if not _validate_service_area(pickup_lat, pickup_lng):
            return Response(
                {"error": "Pickup location is outside the supported service area"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate service area — destination
        if not _validate_service_area(destination_lat, destination_lng):
            return Response(
                {"error": "Destination is outside the supported service area"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for existing open ride
        existing_ride = Ride.objects.filter(
            rider=request.user,
            ride_type="Share",
            status__in=["requested", "driver_arriving", "in_progress"],
        ).first()

        if existing_ride:
            return Response(
                {
                    "error": "Complete or cancel your current ride before requesting a Share ride",
                    "ride_id": existing_ride.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate economy fare: base + per_km * distance
        economy_fare = BASE_FARE_MRU + PER_KM_FARE_MRU * distance_km
        economy_fare = economy_fare.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

        # Calculate share fare using PricingEngine
        pricing_engine = PricingEngine()
        share_fare = pricing_engine.calculate_share_fare(
            economy_fare=economy_fare,
            similarity_score=DEFAULT_SIMILARITY_SCORE,
            seats=seats,
        )
        savings = pricing_engine.calculate_savings(economy_fare, share_fare)

        # Create the ride
        ride = Ride.objects.create(
            rider=request.user,
            pickup=pickup,
            destination=destination,
            pickup_lat=pickup_lat,
            pickup_lng=pickup_lng,
            destination_lat=destination_lat,
            destination_lng=destination_lng,
            ride_type="Share",
            distance_km=distance_km,
            fare=share_fare,
            economy_fare=economy_fare,
            seats=seats,
            status="requested",
            share_status="waiting_match",
        )

        # Trigger matching
        matching_service = MatchingService()
        compatible = matching_service.find_compatible_passengers(ride)

        session = None
        if compatible:
            # Try to find an existing session to join
            for candidate in compatible:
                if candidate.share_session:
                    added = matching_service.add_to_session(
                        candidate.share_session, ride
                    )
                    if added:
                        session = candidate.share_session
                        break

            # If no existing session, create a new one
            if not session and compatible:
                # Take the best match
                best_match = compatible[0]
                session = matching_service.create_session([ride, best_match])

        # If no match found, create a solo session for future matching
        if not session:
            session = ShareRideSession.objects.create(
                status="matching",
                route_similarity_score=DEFAULT_SIMILARITY_SCORE,
            )
            ride.share_session = session
            ride.save(update_fields=["share_session"])

        # Reload ride for response
        ride.refresh_from_db()

        response_data = _build_ride_detail(ride)
        response_data["matching_timeout_seconds"] = MatchingService.MATCHING_TIMEOUT_SECONDS

        return Response(response_data, status=status.HTTP_201_CREATED)


class ShareRideDetailView(APIView):
    """
    GET /api/rides/share/{id}/

    Return Share ride details including fare, savings, session info,
    stops, and other passengers (first name only).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, ride_id):
        ride = get_object_or_404(
            Ride.objects.select_related("share_session", "rider", "driver"),
            pk=ride_id,
            ride_type="Share",
        )

        # Ensure the user is the rider or the session driver
        if ride.rider != request.user:
            if not (ride.share_session and ride.share_session.driver == request.user):
                return Response(
                    {"error": "You do not have permission to view this ride"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        return Response(_build_ride_detail(ride))


class ShareRideCancelView(APIView):
    """
    POST /api/rides/share/{id}/cancel/

    Cancel a Share ride with fee logic based on current status:
    - Free cancellation: requested, matching, driver_assigned
    - Cancellation with fee: driver_arriving
    - Rejected: in_progress, completed, cancelled
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id):
        ride = get_object_or_404(
            Ride.objects.select_related("share_session"),
            pk=ride_id,
            ride_type="Share",
            rider=request.user,
        )

        # Determine cancellation eligibility
        free_cancel_statuses = ["requested", "matching", "driver_assigned"]
        fee_cancel_statuses = ["driver_arriving"]
        reject_statuses = ["in_progress", "completed", "cancelled"]

        # Check session status for the ride
        effective_status = ride.status
        if ride.share_session:
            effective_status = ride.share_session.status

        if effective_status in reject_statuses:
            return Response(
                {"error": "Cannot cancel a ride that is already in progress"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cancellation_fee = Decimal("0")
        if effective_status in fee_cancel_statuses:
            # Cancellation fee: 20% of fare
            cancellation_fee = (ride.fare * Decimal("0.20")).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )

        # Perform cancellation
        ride.status = "cancelled"
        ride.share_status = "cancelled"
        ride.save(update_fields=["status", "share_status"])

        # Recalculate fares for remaining passengers
        recalc_result = None
        if ride.share_session:
            pricing_engine = PricingEngine()
            recalc_result = pricing_engine.recalculate_on_cancellation(
                ride.share_session, ride
            )

            # Notify via WebSocket
            ride_status_service = RideStatusService()
            ride_status_service.broadcast_status_update(ride.share_session)

        return Response({
            "message": "Ride cancelled successfully",
            "cancellation_fee": int(cancellation_fee),
            "refund": int(ride.fare - cancellation_fee) if ride.fare else 0,
            "updated_fares": (
                {str(k): int(v) for k, v in recalc_result["updated_fares"].items()}
                if recalc_result and recalc_result.get("updated_fares")
                else {}
            ),
        })


class ShareRideRateView(APIView):
    """
    POST /api/rides/share/{id}/rate/

    Rate a completed Share ride (1-5 stars + optional review).
    Updates the driver's average rating.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id):
        ride = get_object_or_404(
            Ride.objects.select_related("share_session", "driver"),
            pk=ride_id,
            ride_type="Share",
            rider=request.user,
        )

        # Only completed rides can be rated
        if ride.status != "completed" and ride.share_status != "dropped_off":
            return Response(
                {"error": "You can only rate a completed ride"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Already rated
        if ride.rating is not None:
            return Response(
                {"error": "You have already rated this ride"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rating = request.data.get("rating")
        review = request.data.get("review", "")

        # Validate rating
        try:
            rating = int(rating)
        except (ValueError, TypeError):
            return Response(
                {"error": "Rating must be an integer between 1 and 5"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if rating < 1 or rating > 5:
            return Response(
                {"error": "Rating must be between 1 and 5"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate review length
        if len(review) > 500:
            return Response(
                {"error": "Review must be 500 characters or fewer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save rating
        ride.rating = rating
        ride.review = review
        ride.save(update_fields=["rating", "review"])

        # Update driver's average rating
        driver = ride.share_session.driver if ride.share_session else ride.driver
        if driver:
            try:
                profile = driver.driver_profile
                avg = Ride.objects.filter(
                    driver=driver,
                    rating__isnull=False,
                ).aggregate(avg_rating=Avg("rating"))["avg_rating"]

                if avg is not None:
                    profile.average_rating = Decimal(str(round(avg, 2)))
                    profile.save(update_fields=["average_rating"])
            except Exception as e:
                logger.error("Failed to update driver rating: %s", e)

        return Response({
            "message": "Rating submitted successfully",
            "rating": rating,
            "review": review,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# Task 2.7: Driver-facing Share Session Views
# ═══════════════════════════════════════════════════════════════════════════════


class ShareSessionAcceptView(APIView):
    """
    POST /api/rides/share/session/{id}/accept/

    Driver accepts a Share session. Assigns driver, transitions status
    to "driver_assigned" then "driver_arriving", and notifies all passengers.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_object_or_404(ShareRideSession, pk=session_id)

        # Verify session is in matching status
        if session.status != "matching":
            return Response(
                {"error": f"Cannot accept session in '{session.status}' status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify user is a driver
        try:
            driver_profile = request.user.driver_profile
        except Exception:
            return Response(
                {"error": "You must be a registered driver to accept rides"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if driver_profile.status != "approved":
            return Response(
                {"error": "Your driver account is not approved"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Assign driver to session
        session.driver = request.user
        session.save(update_fields=["driver"])

        # Also assign driver to all active rides in the session
        session.active_rides.update(driver=request.user)

        # Transition status
        ride_status_service = RideStatusService()
        ride_status_service.transition(session, "driver_assigned")
        ride_status_service.transition(session, "driver_arriving")

        # Update share_status for all rides
        session.active_rides.update(share_status="waiting_pickup")

        # Calculate route with driver location
        route_optimizer = RouteOptimizer()
        route_optimizer.recalculate_on_change(session)

        # Notify all passengers with driver details
        driver_info = {
            "type": "share_driver_assigned",
            "driver": {
                "name": f"{request.user.first_name} {request.user.last_name}".strip()
                        or request.user.email,
                "vehicle": f"{driver_profile.vehicle_make or ''} "
                           f"{driver_profile.vehicle_model or ''} "
                           f"{driver_profile.vehicle_color or ''}".strip(),
                "plate_number": driver_profile.plate_number or driver_profile.vehicle_plate or "",
                "rating": float(driver_profile.average_rating),
                "photo_url": driver_profile.driver_photo.url if driver_profile.driver_photo else None,
            },
        }

        for ride in session.active_rides.select_related("rider"):
            ride_status_service.notify_passenger(ride, driver_info)

        return Response({
            "message": "Session accepted successfully",
            "session_id": session.id,
            "passengers_count": session.passengers_count,
            "status": session.status,
        })


class ShareSessionPickupView(APIView):
    """
    POST /api/rides/share/session/{id}/pickup/

    Driver confirms passenger pickup. Pass ride_id in body.
    Updates ride.share_status to "picked_up" and marks the corresponding
    ShareSessionStop as completed.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_object_or_404(
            ShareRideSession,
            pk=session_id,
            driver=request.user,
        )

        ride_id = request.data.get("ride_id")
        if not ride_id:
            return Response(
                {"error": "ride_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride = get_object_or_404(
            Ride,
            pk=ride_id,
            share_session=session,
            ride_type="Share",
        )

        # Validate ride can be picked up
        if ride.share_status not in ("waiting_pickup", "matched"):
            return Response(
                {"error": f"Cannot pick up ride in '{ride.share_status}' status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update ride status
        ride.share_status = "picked_up"
        ride.status = "in_progress"
        ride.save(update_fields=["share_status", "status"])

        # Mark corresponding pickup stop as completed
        pickup_stop = session.stops.filter(
            ride=ride, stop_type="pickup"
        ).first()
        if pickup_stop:
            pickup_stop.completed_at = timezone.now()
            pickup_stop.save(update_fields=["completed_at"])

        # Transition session to in_progress if first pickup
        if session.status == "driver_arriving":
            ride_status_service = RideStatusService()
            ride_status_service.transition(session, "passenger_pickup")

        # If all passengers picked up, transition to in_progress
        all_picked_up = not session.active_rides.exclude(
            share_status__in=["picked_up", "dropped_off"]
        ).exists()

        if all_picked_up and session.status in ("passenger_pickup", "additional_pickup"):
            ride_status_service = RideStatusService()
            ride_status_service.transition(session, "in_progress")

        # Notify passenger
        ride_status_service = RideStatusService()
        ride_status_service.notify_passenger(ride, {
            "type": "share_your_pickup",
            "message": "You have been picked up",
        })

        return Response({
            "message": "Passenger picked up successfully",
            "ride_id": ride.id,
            "share_status": ride.share_status,
            "session_status": session.status,
        })


class ShareSessionDropoffView(APIView):
    """
    POST /api/rides/share/session/{id}/dropoff/

    Driver confirms passenger drop-off. Pass ride_id in body.
    Updates ride.share_status to "dropped_off" and marks the corresponding
    ShareSessionStop as completed.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_object_or_404(
            ShareRideSession,
            pk=session_id,
            driver=request.user,
        )

        ride_id = request.data.get("ride_id")
        if not ride_id:
            return Response(
                {"error": "ride_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ride = get_object_or_404(
            Ride,
            pk=ride_id,
            share_session=session,
            ride_type="Share",
        )

        # Validate ride can be dropped off
        if ride.share_status != "picked_up":
            return Response(
                {"error": f"Cannot drop off ride in '{ride.share_status}' status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update ride status
        ride.share_status = "dropped_off"
        ride.status = "completed"
        ride.completed_at = timezone.now()
        ride.save(update_fields=["share_status", "status", "completed_at"])

        # Mark corresponding dropoff stop as completed
        dropoff_stop = session.stops.filter(
            ride=ride, stop_type="dropoff"
        ).first()
        if dropoff_stop:
            dropoff_stop.completed_at = timezone.now()
            dropoff_stop.save(update_fields=["completed_at"])

        # Transition session status
        ride_status_service = RideStatusService()
        if session.status == "in_progress":
            ride_status_service.transition(session, "drop_off_stop")

        # Notify passenger
        ride_status_service.notify_passenger(ride, {
            "type": "share_your_dropoff",
            "message": "You have arrived at your destination",
        })

        # Broadcast update
        ride_status_service.broadcast_status_update(session)

        return Response({
            "message": "Passenger dropped off successfully",
            "ride_id": ride.id,
            "share_status": ride.share_status,
            "session_status": session.status,
        })


class ShareSessionCompleteView(APIView):
    """
    POST /api/rides/share/session/{id}/complete/

    Complete the session when all passengers have been dropped off.
    Calculates final earnings using PricingEngine and transitions to "completed".
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_object_or_404(
            ShareRideSession,
            pk=session_id,
            driver=request.user,
        )

        # Check all passengers are dropped off
        not_dropped = session.active_rides.exclude(share_status="dropped_off")
        if not_dropped.exists():
            remaining = not_dropped.count()
            return Response(
                {"error": f"Cannot complete session: {remaining} passenger(s) not yet dropped off"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate final earnings
        pricing_engine = PricingEngine()
        driver_earnings = pricing_engine.calculate_driver_earnings(session)
        total_fare = pricing_engine._sum_active_fares(session)
        commission = pricing_engine.calculate_platform_commission(
            total_fare, rate=session.commission_rate
        )

        # Update session
        session.total_fare = total_fare
        session.platform_commission = commission
        session.driver_earnings = driver_earnings
        session.save(update_fields=[
            "total_fare", "platform_commission", "driver_earnings"
        ])

        # Transition to completed
        ride_status_service = RideStatusService()

        # Ensure we can transition (may need to go through drop_off_stop first)
        if session.status == "in_progress":
            ride_status_service.transition(session, "drop_off_stop")

        ride_status_service.transition(session, "completed")

        # Update driver stats
        try:
            profile = request.user.driver_profile
            profile.total_rides_completed += session.passengers_count
            profile.save(update_fields=["total_rides_completed"])
        except Exception as e:
            logger.error("Failed to update driver stats: %s", e)

        return Response({
            "message": "Session completed successfully",
            "session_id": session.id,
            "total_fare": int(total_fare),
            "platform_commission": int(commission),
            "driver_earnings": int(driver_earnings),
            "passengers_count": session.passengers_count,
        })


class ShareSessionStopsView(APIView):
    """
    GET /api/rides/share/session/{id}/stops/

    Return ordered list of stops with type, location, ETA, and completion status.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = get_object_or_404(ShareRideSession, pk=session_id)

        # Verify user is the driver or a passenger in this session
        is_driver = session.driver == request.user
        is_passenger = session.rides.filter(rider=request.user).exists()

        if not is_driver and not is_passenger:
            return Response(
                {"error": "You do not have permission to view these stops"},
                status=status.HTTP_403_FORBIDDEN,
            )

        stops = session.stops.all().order_by("stop_order").select_related("ride__rider")

        stops_data = []
        for stop in stops:
            stops_data.append({
                "stop_order": stop.stop_order,
                "type": stop.stop_type,
                "location_name": stop.location_name,
                "lat": stop.latitude,
                "lng": stop.longitude,
                "eta_minutes": stop.eta_minutes,
                "completed": stop.completed_at is not None,
                "completed_at": stop.completed_at.isoformat() if stop.completed_at else None,
                "ride_id": stop.ride_id,
                "passenger_name": _get_first_name(stop.ride.rider) if stop.ride and stop.ride.rider else None,
            })

        return Response({
            "session_id": session.id,
            "session_status": session.status,
            "stops": stops_data,
        })
