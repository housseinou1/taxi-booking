from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Ride, RideStop
from .serializers import RideStopSerializer

MAX_RIDE_STOPS = 3
EDITABLE_STOP_STATUSES = {
    "requested",
    "accepted",
    "driver_arriving",
    "driver_arrived",
}


def can_edit_ride_stops(ride):
    return ride.status in EDITABLE_STOP_STATUSES


class RideStopListCreateView(APIView):
    """
    POST /rides/{ride_id}/stops/ - Add a stop to a ride.
    Allowed before the trip starts (through driver_arrived).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id):
        ride = get_object_or_404(Ride, id=ride_id)

        # Only the rider who owns the ride can add stops
        if ride.rider_id != request.user.id:
            return Response(
                {"detail": "Only the rider can add stops to this ride."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not can_edit_ride_stops(ride):
            return Response(
                {
                    "detail": (
                        "Stops can only be added before the trip starts "
                        "(requested, accepted, driver arriving, or driver arrived)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ride.stops.count() >= MAX_RIDE_STOPS:
            return Response(
                {"detail": f"A ride can have at most {MAX_RIDE_STOPS} stops."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate required fields
        location_name = request.data.get("location_name")
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        stop_order = request.data.get("stop_order")

        if not location_name:
            return Response(
                {"detail": "location_name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if latitude is None or longitude is None:
            return Response(
                {"detail": "latitude and longitude are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (TypeError, ValueError):
            return Response(
                {"detail": "latitude and longitude must be valid numbers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine stop_order: if not provided, append at end
        if stop_order is not None:
            try:
                stop_order = int(stop_order)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "stop_order must be a valid integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if stop_order < 1:
                return Response(
                    {"detail": "stop_order must be at least 1."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Shift existing stops to make room if inserting in the middle
            existing_stops = ride.stops.filter(stop_order__gte=stop_order)
            for stop in existing_stops.order_by("-stop_order"):
                stop.stop_order += 1
                stop.save(update_fields=["stop_order"])
        else:
            # Auto-assign next order
            last_stop = ride.stops.order_by("-stop_order").first()
            stop_order = (last_stop.stop_order + 1) if last_stop else 1

        # Create the stop
        ride_stop = RideStop.objects.create(
            ride=ride,
            stop_order=stop_order,
            location_name=location_name,
            latitude=latitude,
            longitude=longitude,
        )

        serializer = RideStopSerializer(ride_stop)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RideStopDeleteView(APIView):
    """
    DELETE /rides/{ride_id}/stops/{stop_id}/ - Remove a stop from a ride.
    Only allowed when ride status is "requested" (during booking).
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, ride_id, stop_id):
        ride = get_object_or_404(Ride, id=ride_id)

        # Only the rider who owns the ride can remove stops
        if ride.rider_id != request.user.id:
            return Response(
                {"detail": "Only the rider can remove stops from this ride."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not can_edit_ride_stops(ride):
            return Response(
                {
                    "detail": (
                        "Stops can only be removed before the trip starts "
                        "(requested, accepted, driver arriving, or driver arrived)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        stop = get_object_or_404(RideStop, id=stop_id, ride=ride)
        removed_order = stop.stop_order
        stop.delete()

        # Re-order remaining stops to fill the gap
        remaining_stops = ride.stops.filter(stop_order__gt=removed_order)
        for remaining_stop in remaining_stops.order_by("stop_order"):
            remaining_stop.stop_order -= 1
            remaining_stop.save(update_fields=["stop_order"])

        return Response(status=status.HTTP_204_NO_CONTENT)


class RideStopArrivedView(APIView):
    """
    POST /rides/{ride_id}/stops/{stop_id}/arrived/ - Mark arrival at a stop.
    Only allowed when ride is in_progress and the driver is assigned.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id, stop_id):
        ride = get_object_or_404(Ride, id=ride_id)

        # Only the assigned driver can mark arrival
        if ride.driver_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can mark stop arrival."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Ride must be in_progress
        if ride.status != "in_progress":
            return Response(
                {"detail": "Ride must be in progress to mark stop arrival."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stop = get_object_or_404(RideStop, id=stop_id, ride=ride)

        # Stop must not already be arrived
        if stop.arrived_at is not None:
            return Response(
                {"detail": "Already arrived at this stop."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate stop order: previous stops must be departed
        previous_stops = ride.stops.filter(stop_order__lt=stop.stop_order)
        for prev_stop in previous_stops:
            if prev_stop.departed_at is None:
                return Response(
                    {
                        "detail": (
                            f"Must depart from stop #{prev_stop.stop_order} "
                            f"('{prev_stop.location_name}') before arriving at this stop."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        stop.arrived_at = timezone.now()
        stop.save(update_fields=["arrived_at"])

        serializer = RideStopSerializer(stop)
        return Response(serializer.data)


class RideStopDepartedView(APIView):
    """
    POST /rides/{ride_id}/stops/{stop_id}/departed/ - Mark departure from a stop.
    Only allowed when ride is in_progress and the driver is assigned.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, ride_id, stop_id):
        ride = get_object_or_404(Ride, id=ride_id)

        # Only the assigned driver can mark departure
        if ride.driver_id != request.user.id:
            return Response(
                {"detail": "Only the assigned driver can mark stop departure."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Ride must be in_progress
        if ride.status != "in_progress":
            return Response(
                {"detail": "Ride must be in progress to mark stop departure."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stop = get_object_or_404(RideStop, id=stop_id, ride=ride)

        # Must have arrived first
        if stop.arrived_at is None:
            return Response(
                {"detail": "Must arrive at this stop before departing."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Must not already be departed
        if stop.departed_at is not None:
            return Response(
                {"detail": "Already departed from this stop."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stop.departed_at = timezone.now()
        stop.save(update_fields=["departed_at"])

        serializer = RideStopSerializer(stop)
        return Response(serializer.data)
