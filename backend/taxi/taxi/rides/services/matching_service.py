"""
MatchingService — Passenger matching for Yala Share rides.

Finds compatible passengers based on route similarity, proximity constraints,
and ETA impact limits. Creates and manages ShareRideSessions.
"""

import logging
import math
from decimal import Decimal

from django.db.models import Q

from taxi.rides.models import Ride, ShareRideSession
from taxi.rides.services.pricing_engine import PricingEngine
from taxi.rides.services.route_optimizer import RouteOptimizer

logger = logging.getLogger(__name__)


class MatchingService:
    """Finds compatible passengers for Share rides."""

    ROUTE_SIMILARITY_THRESHOLD = 0.6
    MAX_PICKUP_DISTANCE_KM = 1.5
    MAX_DESTINATION_DISTANCE_KM = 2.0
    MAX_ETA_IMPACT_MINUTES = 8
    MATCHING_TIMEOUT_SECONDS = 120
    MAX_PASSENGERS_PER_SESSION = 3

    def __init__(self):
        self.pricing_engine = PricingEngine()
        self.route_optimizer = RouteOptimizer()

    def find_compatible_passengers(self, ride):
        """
        Search for other Share rides in 'waiting_match' status with compatible routes.

        Filters by:
        - route_similarity >= 0.6
        - pickup distance <= 1.5km
        - destination distance <= 2km

        Args:
            ride: The Ride instance to find matches for.

        Returns:
            List of compatible Ride instances, sorted by similarity (highest first).
        """
        # Find other Share rides waiting for a match
        candidates = Ride.objects.filter(
            ride_type="Share",
            share_status="waiting_match",
            status="requested",
        ).exclude(pk=ride.pk).select_related("rider")

        compatible = []

        for candidate in candidates:
            # Check pickup proximity
            pickup_distance = self.haversine_distance(
                ride.pickup_lat, ride.pickup_lng,
                candidate.pickup_lat, candidate.pickup_lng,
            )
            if pickup_distance > self.MAX_PICKUP_DISTANCE_KM:
                continue

            # Check destination proximity
            dest_distance = self.haversine_distance(
                ride.destination_lat, ride.destination_lng,
                candidate.destination_lat, candidate.destination_lng,
            )
            if dest_distance > self.MAX_DESTINATION_DISTANCE_KM:
                continue

            # Check route similarity
            similarity = self.calculate_route_similarity(ride, candidate)
            if similarity < self.ROUTE_SIMILARITY_THRESHOLD:
                continue

            compatible.append((candidate, similarity))

        # Sort by similarity score (highest first)
        compatible.sort(key=lambda x: x[1], reverse=True)

        logger.info(
            "Found %d compatible passengers for ride #%d",
            len(compatible),
            ride.id,
        )

        return [c[0] for c in compatible]

    def calculate_route_similarity(self, ride_a, ride_b):
        """
        Calculate route overlap score (0.0 to 1.0).

        Uses a combination of:
        - Pickup proximity (closer = higher score) — weight 0.3
        - Destination proximity (closer = higher score) — weight 0.3
        - Direction similarity (similar bearing = higher score) — weight 0.4

        Args:
            ride_a: First Ride instance.
            ride_b: Second Ride instance.

        Returns:
            Float between 0.0 and 1.0 representing route similarity.
        """
        # Pickup proximity score (0 to 1)
        pickup_dist = self.haversine_distance(
            ride_a.pickup_lat, ride_a.pickup_lng,
            ride_b.pickup_lat, ride_b.pickup_lng,
        )
        # Score decreases linearly: 0km = 1.0, >= 3km = 0.0
        pickup_score = max(0.0, 1.0 - (pickup_dist / 3.0))

        # Destination proximity score (0 to 1)
        dest_dist = self.haversine_distance(
            ride_a.destination_lat, ride_a.destination_lng,
            ride_b.destination_lat, ride_b.destination_lng,
        )
        # Score decreases linearly: 0km = 1.0, >= 4km = 0.0
        dest_score = max(0.0, 1.0 - (dest_dist / 4.0))

        # Direction similarity score (0 to 1)
        bearing_a = self._calculate_bearing(
            ride_a.pickup_lat, ride_a.pickup_lng,
            ride_a.destination_lat, ride_a.destination_lng,
        )
        bearing_b = self._calculate_bearing(
            ride_b.pickup_lat, ride_b.pickup_lng,
            ride_b.destination_lat, ride_b.destination_lng,
        )
        # Angular difference (0 to 180 degrees)
        angle_diff = abs(bearing_a - bearing_b)
        if angle_diff > 180:
            angle_diff = 360 - angle_diff
        # Score: 0 degrees diff = 1.0, 180 degrees diff = 0.0
        direction_score = max(0.0, 1.0 - (angle_diff / 180.0))

        # Weighted combination
        similarity = (
            0.3 * pickup_score
            + 0.3 * dest_score
            + 0.4 * direction_score
        )

        return round(similarity, 4)

    def calculate_eta_impact(self, session, new_ride):
        """
        Calculate how much extra time adding this passenger adds to existing passengers.

        Returns:
            Dict: {ride_id: impact_minutes, ...} for each existing passenger.
        """
        active_rides = list(session.active_rides.select_related("rider"))
        impacts = {}

        if not active_rides:
            return impacts

        # Get driver location
        driver_lat, driver_lng = self._get_session_driver_location(session)

        # Calculate current ETAs without the new ride
        current_stops = []
        for ride in active_rides:
            current_stops.append({
                "type": "pickup",
                "ride_id": ride.id,
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
            })
            current_stops.append({
                "type": "dropoff",
                "ride_id": ride.id,
                "lat": ride.destination_lat,
                "lng": ride.destination_lng,
            })

        current_stops = self.route_optimizer.calculate_eta_for_stops(
            (driver_lat, driver_lng), current_stops
        )

        # Build current ETA map (use dropoff ETA as the passenger's total time)
        current_etas = {}
        for stop in current_stops:
            if stop["type"] == "dropoff":
                current_etas[stop["ride_id"]] = stop["eta_minutes"]

        # Calculate new ETAs with the new ride included
        new_stops = list(current_stops)
        new_stops.append({
            "type": "pickup",
            "ride_id": new_ride.id,
            "lat": new_ride.pickup_lat,
            "lng": new_ride.pickup_lng,
        })
        new_stops.append({
            "type": "dropoff",
            "ride_id": new_ride.id,
            "lat": new_ride.destination_lat,
            "lng": new_ride.destination_lng,
        })

        # Re-sort: pickups first, then dropoffs
        pickups = [s for s in new_stops if s["type"] == "pickup"]
        dropoffs = [s for s in new_stops if s["type"] == "dropoff"]

        pickups.sort(
            key=lambda s: self.haversine_distance(
                driver_lat, driver_lng, s["lat"], s["lng"]
            )
        )

        if pickups:
            last_pickup = pickups[-1]
            ref_lat, ref_lng = last_pickup["lat"], last_pickup["lng"]
        else:
            ref_lat, ref_lng = driver_lat, driver_lng

        dropoffs.sort(
            key=lambda s: self.haversine_distance(
                ref_lat, ref_lng, s["lat"], s["lng"]
            )
        )

        reordered = pickups + dropoffs
        reordered = self.route_optimizer.calculate_eta_for_stops(
            (driver_lat, driver_lng), reordered
        )

        # Calculate new ETA map
        new_etas = {}
        for stop in reordered:
            if stop["type"] == "dropoff":
                new_etas[stop["ride_id"]] = stop["eta_minutes"]

        # Calculate impact for each existing passenger
        for ride in active_rides:
            old_eta = current_etas.get(ride.id, 0)
            new_eta = new_etas.get(ride.id, 0)
            impacts[ride.id] = max(0, new_eta - old_eta)

        return impacts

    def create_session(self, rides):
        """
        Create a ShareRideSession and assign rides to it.

        Calculates route similarity between all rides and sets the session's
        route_similarity_score to the average.

        Args:
            rides: List of Ride instances to group into a session.

        Returns:
            The created ShareRideSession instance.
        """
        # Calculate average route similarity
        total_similarity = 0.0
        pair_count = 0

        for i in range(len(rides)):
            for j in range(i + 1, len(rides)):
                similarity = self.calculate_route_similarity(rides[i], rides[j])
                total_similarity += similarity
                pair_count += 1

        avg_similarity = total_similarity / pair_count if pair_count > 0 else 0.7

        # Create session
        session = ShareRideSession.objects.create(
            status="matching",
            route_similarity_score=avg_similarity,
        )

        # Assign rides to session and update their status
        total_fare = Decimal("0")
        for ride in rides:
            ride.share_session = session
            ride.share_status = "matched"

            # Calculate share fare if not already set
            if ride.economy_fare and not ride.fare:
                ride.fare = self.pricing_engine.calculate_share_fare(
                    economy_fare=ride.economy_fare,
                    similarity_score=avg_similarity,
                    seats=ride.seats,
                )

            ride.save(update_fields=["share_session", "share_status", "fare"])
            total_fare += ride.fare

        # Update session totals
        commission = self.pricing_engine.calculate_platform_commission(total_fare)
        session.total_fare = total_fare
        session.platform_commission = commission
        session.driver_earnings = total_fare - commission
        session.save(update_fields=[
            "total_fare", "platform_commission", "driver_earnings"
        ])

        # Calculate optimal route
        self.route_optimizer.calculate_optimal_order(session)

        logger.info(
            "Created session #%d with %d rides, similarity=%.2f",
            session.id,
            len(rides),
            avg_similarity,
        )

        return session

    def add_to_session(self, session, ride):
        """
        Add a passenger to an existing session if constraints are met.

        Checks:
        - Session has < 3 passengers
        - ETA impact <= 8 min for all existing passengers

        Args:
            session: The ShareRideSession to add to.
            ride: The Ride instance to add.

        Returns:
            True if added successfully, False if constraints violated.
        """
        # Check passenger limit
        if session.passengers_count >= self.MAX_PASSENGERS_PER_SESSION:
            logger.info(
                "Cannot add ride #%d to session #%d: session full (%d passengers)",
                ride.id,
                session.id,
                session.passengers_count,
            )
            return False

        # Check ETA impact
        impacts = self.calculate_eta_impact(session, ride)
        for ride_id, impact in impacts.items():
            if impact > self.MAX_ETA_IMPACT_MINUTES:
                logger.info(
                    "Cannot add ride #%d to session #%d: "
                    "ETA impact %d min for ride #%d exceeds limit of %d min",
                    ride.id,
                    session.id,
                    impact,
                    ride_id,
                    self.MAX_ETA_IMPACT_MINUTES,
                )
                return False

        # Calculate similarity with existing rides
        active_rides = list(session.active_rides)
        total_similarity = 0.0
        for existing_ride in active_rides:
            total_similarity += self.calculate_route_similarity(existing_ride, ride)

        avg_similarity = (
            total_similarity / len(active_rides) if active_rides else 0.7
        )

        # Update session similarity (weighted average with existing)
        old_count = len(active_rides)
        new_similarity = (
            (session.route_similarity_score * old_count + avg_similarity)
            / (old_count + 1)
        )
        session.route_similarity_score = new_similarity

        # Assign ride to session
        ride.share_session = session
        ride.share_status = "matched"

        # Calculate fare
        if ride.economy_fare:
            ride.fare = self.pricing_engine.calculate_share_fare(
                economy_fare=ride.economy_fare,
                similarity_score=new_similarity,
                seats=ride.seats,
            )

        ride.save(update_fields=["share_session", "share_status", "fare"])

        # Update session totals
        total_fare = Decimal("0")
        for r in session.active_rides:
            total_fare += r.fare

        commission = self.pricing_engine.calculate_platform_commission(total_fare)
        session.total_fare = total_fare
        session.platform_commission = commission
        session.driver_earnings = total_fare - commission
        session.save(update_fields=[
            "route_similarity_score", "total_fare",
            "platform_commission", "driver_earnings",
        ])

        # Recalculate route
        self.route_optimizer.recalculate_on_change(session)

        logger.info(
            "Added ride #%d to session #%d (now %d passengers)",
            ride.id,
            session.id,
            session.passengers_count,
        )

        return True

    @staticmethod
    def haversine_distance(lat1, lng1, lat2, lng2):
        """
        Calculate distance in km between two points using haversine formula.

        Args:
            lat1, lng1: Coordinates of point 1 (degrees).
            lat2, lng2: Coordinates of point 2 (degrees).

        Returns:
            Distance in kilometers.
        """
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

    # ─── Private helpers ──────────────────────────────────────────────────

    def _calculate_bearing(self, lat1, lng1, lat2, lng2):
        """
        Calculate initial bearing from point 1 to point 2.

        Returns bearing in degrees (0-360).
        """
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlng = math.radians(lng2 - lng1)

        x = math.sin(dlng) * math.cos(lat2_rad)
        y = (
            math.cos(lat1_rad) * math.sin(lat2_rad)
            - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlng)
        )

        bearing = math.atan2(x, y)
        bearing = math.degrees(bearing)
        bearing = (bearing + 360) % 360

        return bearing

    def _get_session_driver_location(self, session):
        """Get driver location for a session."""
        if session.driver_id:
            try:
                profile = session.driver.driver_profile
                if profile.current_lat and profile.current_lng:
                    return profile.current_lat, profile.current_lng
            except Exception:
                pass

        # Fallback: first ride's pickup
        first_ride = session.active_rides.first()
        if first_ride:
            return first_ride.pickup_lat, first_ride.pickup_lng

        return 18.0735, -15.9582
