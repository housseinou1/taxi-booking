"""
Ride History API endpoints for the Premium Driver App.

Provides:
- GET /drivers/me/rides/?page=1&status=&date_from=&date_to=

Paginated ride history (20 per page) with date range and status filters.
Includes multi-stop data in responses.

Requirements: 13.1, 13.2, 13.6
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from taxi.rides.models import Ride


class DriverRideHistoryView(APIView):
    """
    GET /drivers/me/rides/?page=1&status=&date_from=&date_to=

    Returns paginated ride history for the authenticated driver.
    - 20 rides per page
    - Supports filtering by status and date range (date_from, date_to)
    - Includes multi-stop data in each ride
    - Ordered by created_at descending (most recent first)
    """

    permission_classes = [IsAuthenticated]
    PAGE_SIZE = 20

    def get(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=404,
            )

        # Base queryset: all rides assigned to this driver
        queryset = Ride.objects.filter(
            driver=request.user
        ).select_related("rider").prefetch_related("stops").order_by("-created_at")

        # Apply status filter
        status_filter = request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Apply date range filters
        date_from = request.query_params.get("date_from", "").strip()
        date_to = request.query_params.get("date_to", "").strip()

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        # Pagination
        try:
            page = int(request.query_params.get("page", 1))
        except (ValueError, TypeError):
            page = 1

        if page < 1:
            page = 1

        total_count = queryset.count()
        total_pages = (total_count + self.PAGE_SIZE - 1) // self.PAGE_SIZE if total_count > 0 else 1

        start = (page - 1) * self.PAGE_SIZE
        end = start + self.PAGE_SIZE
        rides = queryset[start:end]

        # Serialize rides
        rides_data = []
        for ride in rides:
            stops_data = [
                {
                    "id": stop.id,
                    "stop_order": stop.stop_order,
                    "location_name": stop.location_name,
                    "latitude": stop.latitude,
                    "longitude": stop.longitude,
                    "arrived_at": stop.arrived_at.isoformat() if stop.arrived_at else None,
                    "departed_at": stop.departed_at.isoformat() if stop.departed_at else None,
                }
                for stop in ride.stops.all()
            ]

            ride_data = {
                "id": ride.id,
                "pickup": ride.pickup,
                "destination": ride.destination,
                "pickup_lat": ride.pickup_lat,
                "pickup_lng": ride.pickup_lng,
                "destination_lat": ride.destination_lat,
                "destination_lng": ride.destination_lng,
                "fare": str(ride.fare),
                "driver_earning": str(ride.driver_earning),
                "distance_km": str(ride.distance_km),
                "status": ride.status,
                "ride_type": ride.ride_type,
                "rating": ride.rating,
                "review": ride.review,
                "created_at": ride.created_at.isoformat(),
                "completed_at": ride.completed_at.isoformat() if ride.completed_at else None,
                "scheduled_at": ride.scheduled_at.isoformat() if ride.scheduled_at else None,
                "rider_name": self._get_rider_name(ride),
                "stops": stops_data,
                "has_stops": len(stops_data) > 0,
                "stop_count": len(stops_data),
            }
            rides_data.append(ride_data)

        return Response({
            "count": total_count,
            "total_pages": total_pages,
            "current_page": page,
            "page_size": self.PAGE_SIZE,
            "results": rides_data,
        })

    def _get_rider_name(self, ride):
        """Get the rider's display name."""
        if ride.rider:
            name = f"{ride.rider.first_name} {ride.rider.last_name}".strip()
            return name if name else ride.rider.email
        return ""
