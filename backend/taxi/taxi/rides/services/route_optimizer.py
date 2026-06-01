"""
RouteOptimizer — Optimal stop ordering for Share ride sessions.

Calculates the best pickup/drop-off sequence for multi-passenger trips,
creates ShareSessionStop records, and estimates ETAs based on distance.
"""

import logging
import math

from django.utils import timezone

from taxi.rides.models import ShareSessionStop

logger = logging.getLogger(__name__)


class RouteOptimizer:
    """Calculates optimal stop order for multi-passenger Share trips."""

    # Average city speed assumption: ~2 minutes per km in Nouakchott
    MINUTES_PER_KM = 2.0

    def calculate_optimal_order(self, session):
        """
        Calculate optimal stop order: all pickups first, then drop-offs.

        Within pickups: order by proximity to driver (or session creation point).
        Within drop-offs: order by proximity to last pickup.

        Returns list of dicts:
            {type, ride_id, lat, lng, passenger_name, stop_order}

        Creates/updates ShareSessionStop records.
        """
        active_rides = list(session.active_rides.select_related("rider"))

        if not active_rides:
            return []

        # Determine driver location (use driver profile or first pickup as reference)
        driver_lat, driver_lng = self._get_driver_location(session)

        # Build pickup stops
        pickups = []
        for ride in active_rides:
            pickups.append({
                "type": "pickup",
                "ride_id": ride.id,
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
                "passenger_name": self._get_first_name(ride.rider),
                "location_name": ride.pickup,
            })

        # Build drop-off stops
        dropoffs = []
        for ride in active_rides:
            dropoffs.append({
                "type": "dropoff",
                "ride_id": ride.id,
                "lat": ride.destination_lat,
                "lng": ride.destination_lng,
                "passenger_name": self._get_first_name(ride.rider),
                "location_name": ride.destination,
            })

        # Sort pickups by proximity to driver
        pickups.sort(
            key=lambda s: self._haversine(driver_lat, driver_lng, s["lat"], s["lng"])
        )

        # Sort drop-offs by proximity to last pickup location
        if pickups:
            last_pickup = pickups[-1]
            ref_lat, ref_lng = last_pickup["lat"], last_pickup["lng"]
        else:
            ref_lat, ref_lng = driver_lat, driver_lng

        dropoffs.sort(
            key=lambda s: self._haversine(ref_lat, ref_lng, s["lat"], s["lng"])
        )

        # Combine: all pickups first, then all drop-offs
        ordered_stops = pickups + dropoffs

        # Assign stop_order
        for i, stop in enumerate(ordered_stops):
            stop["stop_order"] = i + 1

        # Calculate ETAs
        ordered_stops = self.calculate_eta_for_stops(
            (driver_lat, driver_lng), ordered_stops
        )

        # Persist to database
        self._save_stops(session, ordered_stops)

        return ordered_stops

    def recalculate_on_change(self, session):
        """
        Recalculate stop order after passenger addition or removal.

        Deletes existing stops and creates new ones based on current
        active rides in the session.
        """
        # Delete old stops
        session.stops.all().delete()

        # Recalculate
        return self.calculate_optimal_order(session)

    def calculate_eta_for_stops(self, driver_location, stops):
        """
        Estimate ETA for each stop from driver's current position.

        Uses simple distance-based estimation: ~2 min per km in city.
        ETAs are cumulative from the driver's position through each stop.

        Args:
            driver_location: Tuple of (lat, lng) for driver's current position.
            stops: List of stop dicts with 'lat' and 'lng' keys.

        Returns:
            The same list with 'eta_minutes' added/updated for each stop.
        """
        if not stops:
            return stops

        current_lat, current_lng = driver_location
        cumulative_minutes = 0

        for stop in stops:
            distance_km = self._haversine(
                current_lat, current_lng, stop["lat"], stop["lng"]
            )
            travel_minutes = distance_km * self.MINUTES_PER_KM
            cumulative_minutes += travel_minutes
            stop["eta_minutes"] = round(cumulative_minutes)

            # Move reference point to this stop for next calculation
            current_lat, current_lng = stop["lat"], stop["lng"]

        return stops

    # ─── Private helpers ──────────────────────────────────────────────────

    def _get_driver_location(self, session):
        """Get driver's current location or fall back to default."""
        if session.driver_id:
            try:
                profile = session.driver.driver_profile
                if profile.current_lat and profile.current_lng:
                    return profile.current_lat, profile.current_lng
            except Exception:
                pass

        # Fallback: use the first ride's pickup as reference
        first_ride = session.active_rides.first()
        if first_ride:
            return first_ride.pickup_lat, first_ride.pickup_lng

        # Default Nouakchott center
        return 18.0735, -15.9582

    def _get_first_name(self, user):
        """Extract first name from user, falling back to email prefix."""
        if user.first_name:
            return user.first_name.split()[0]
        return user.email.split("@")[0]

    def _haversine(self, lat1, lng1, lat2, lng2):
        """Calculate distance in km between two points using haversine formula."""
        R = 6371  # Earth's radius in km

        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)

        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def _save_stops(self, session, ordered_stops):
        """Persist ordered stops as ShareSessionStop records."""
        # Delete existing stops for this session
        session.stops.all().delete()

        stop_objects = []
        for stop in ordered_stops:
            stop_objects.append(
                ShareSessionStop(
                    session=session,
                    ride_id=stop["ride_id"],
                    stop_type=stop["type"],
                    stop_order=stop["stop_order"],
                    location_name=stop.get("location_name", ""),
                    latitude=stop["lat"],
                    longitude=stop["lng"],
                    eta_minutes=stop.get("eta_minutes", 0),
                )
            )

        ShareSessionStop.objects.bulk_create(stop_objects)
        logger.info(
            "Created %d stops for session #%d", len(stop_objects), session.id
        )
