"""
PricingEngine — Dynamic fare calculation for Yala Share rides.

Handles discount computation based on route similarity, driver earnings
protection, platform commission, and fare recalculation on cancellation.

All monetary values use Decimal for precision and are rounded to whole MRU
(Mauritanian Ouguiya) for user-facing display.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger(__name__)


class PricingEngine:
    """Calculates dynamic Share ride fares and driver earnings."""

    # Discount range off Economy fare
    MIN_DISCOUNT_PERCENT = 30  # At similarity_score = 0.6
    MAX_DISCOUNT_PERCENT = 50  # At similarity_score = 1.0

    # Platform takes 20% commission on total fares
    DEFAULT_COMMISSION_RATE = Decimal("0.20")

    # Similarity score boundaries for linear interpolation
    MIN_SIMILARITY_SCORE = 0.6
    MAX_SIMILARITY_SCORE = 1.0

    def calculate_share_fare(self, economy_fare, similarity_score, seats=1):
        """
        Calculate Share fare based on Economy fare and route similarity.

        The discount scales linearly from 30% (at similarity_score=0.6) to
        50% (at similarity_score=1.0). The resulting per-seat fare is
        multiplied by the number of seats and rounded to the nearest whole MRU.

        Args:
            economy_fare: The equivalent Economy fare (Decimal or numeric).
            similarity_score: Route overlap score between 0.6 and 1.0.
            seats: Number of seats booked (1 or 2).

        Returns:
            Decimal: The total Share fare rounded to nearest whole MRU.

        Raises:
            ValueError: If similarity_score is outside [0.6, 1.0] or seats < 1.
        """
        economy_fare = Decimal(str(economy_fare))
        seats = int(seats)

        if similarity_score < self.MIN_SIMILARITY_SCORE:
            raise ValueError(
                f"similarity_score must be >= {self.MIN_SIMILARITY_SCORE}, "
                f"got {similarity_score}"
            )
        if similarity_score > self.MAX_SIMILARITY_SCORE:
            raise ValueError(
                f"similarity_score must be <= {self.MAX_SIMILARITY_SCORE}, "
                f"got {similarity_score}"
            )
        if seats < 1:
            raise ValueError(f"seats must be >= 1, got {seats}")

        # Linear interpolation of discount percentage
        # At 0.6 → 30% discount, at 1.0 → 50% discount
        score_range = self.MAX_SIMILARITY_SCORE - self.MIN_SIMILARITY_SCORE
        normalized_score = (similarity_score - self.MIN_SIMILARITY_SCORE) / score_range
        discount_percent = (
            self.MIN_DISCOUNT_PERCENT
            + normalized_score * (self.MAX_DISCOUNT_PERCENT - self.MIN_DISCOUNT_PERCENT)
        )

        # Apply discount: fare = economy_fare × (1 - discount/100)
        discount_factor = Decimal(str(1 - discount_percent / 100))
        per_seat_fare = economy_fare * discount_factor

        # Multiply by seats and round to nearest whole MRU
        total_fare = per_seat_fare * Decimal(str(seats))
        rounded_fare = total_fare.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

        logger.debug(
            "Share fare: economy=%s, similarity=%.2f, discount=%.1f%%, "
            "per_seat=%s, seats=%d, total=%s",
            economy_fare,
            similarity_score,
            discount_percent,
            per_seat_fare,
            seats,
            rounded_fare,
        )

        return rounded_fare

    def calculate_savings(self, economy_fare, share_fare):
        """
        Calculate the amount saved compared to Economy fare.

        Args:
            economy_fare: The Economy fare (Decimal or numeric).
            share_fare: The calculated Share fare (Decimal or numeric).

        Returns:
            Decimal: The savings amount (always non-negative).
        """
        economy_fare = Decimal(str(economy_fare))
        share_fare = Decimal(str(share_fare))
        savings = economy_fare - share_fare

        # Savings should always be positive for valid Share fares
        if savings < 0:
            logger.warning(
                "Negative savings detected: economy=%s, share=%s",
                economy_fare,
                share_fare,
            )
            return Decimal("0")

        return savings

    def calculate_driver_earnings(self, session):
        """
        Calculate driver earnings for a Share session.

        Driver earnings = sum of all non-cancelled ride fares - platform commission.

        Args:
            session: A ShareRideSession instance.

        Returns:
            Decimal: Driver earnings rounded to nearest whole MRU.
        """
        total_fares = self._sum_active_fares(session)
        commission = self.calculate_platform_commission(
            total_fares, rate=session.commission_rate
        )
        earnings = total_fares - commission

        return earnings.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    def calculate_platform_commission(self, total_fares, rate=None):
        """
        Calculate platform commission from total fares.

        Args:
            total_fares: Sum of all passenger fares (Decimal or numeric).
            rate: Commission rate as Decimal (default: 0.20).

        Returns:
            Decimal: Commission amount rounded to nearest whole MRU.
        """
        total_fares = Decimal(str(total_fares))
        if rate is None:
            rate = self.DEFAULT_COMMISSION_RATE
        else:
            rate = Decimal(str(rate))

        commission = total_fares * rate
        return commission.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    def recalculate_on_cancellation(self, session, cancelled_ride):
        """
        Recalculate fares for remaining passengers after a cancellation.

        When a passenger cancels, the route similarity may change for the
        remaining passengers. This method recalculates each remaining
        passenger's fare and updates the session totals.

        Args:
            session: A ShareRideSession instance.
            cancelled_ride: The Ride instance that was cancelled.

        Returns:
            dict: {
                "updated_fares": {ride_id: new_fare, ...},
                "total_fare": Decimal,
                "platform_commission": Decimal,
                "driver_earnings": Decimal,
            }
        """
        # Mark the cancelled ride
        cancelled_ride.share_status = "cancelled"
        cancelled_ride.status = "cancelled"
        cancelled_ride.save(update_fields=["share_status", "status"])

        active_rides = session.active_rides.exclude(pk=cancelled_ride.pk)
        updated_fares = {}

        if not active_rides.exists():
            # No remaining passengers — cancel the session
            session.status = "cancelled"
            session.total_fare = Decimal("0")
            session.platform_commission = Decimal("0")
            session.driver_earnings = Decimal("0")
            session.save(update_fields=[
                "status", "total_fare", "platform_commission", "driver_earnings"
            ])
            logger.info(
                "Session #%d cancelled — no remaining passengers.", session.id
            )
            return {
                "updated_fares": {},
                "total_fare": Decimal("0"),
                "platform_commission": Decimal("0"),
                "driver_earnings": Decimal("0"),
            }

        # Recalculate fares for remaining rides using session similarity score
        similarity_score = session.route_similarity_score
        for ride in active_rides:
            if ride.economy_fare:
                new_fare = self.calculate_share_fare(
                    economy_fare=ride.economy_fare,
                    similarity_score=similarity_score,
                    seats=ride.seats,
                )
                ride.fare = new_fare
                ride.save(update_fields=["fare"])
                updated_fares[ride.id] = new_fare

        # Update session totals
        total_fare = self._sum_active_fares(session)
        commission = self.calculate_platform_commission(
            total_fare, rate=session.commission_rate
        )
        driver_earnings = total_fare - commission

        session.total_fare = total_fare
        session.platform_commission = commission
        session.driver_earnings = driver_earnings
        session.save(update_fields=[
            "total_fare", "platform_commission", "driver_earnings"
        ])

        logger.info(
            "Session #%d recalculated after cancellation: "
            "total_fare=%s, commission=%s, driver_earnings=%s",
            session.id,
            total_fare,
            commission,
            driver_earnings,
        )

        return {
            "updated_fares": updated_fares,
            "total_fare": total_fare,
            "platform_commission": commission,
            "driver_earnings": driver_earnings,
        }

    def validate_driver_earnings_protection(self, session, economy_fare):
        """
        Ensure the driver earns at least as much as a single Economy ride.

        The driver's Share session earnings must be >= what they'd earn on a
        single Economy ride after commission deduction.

        Args:
            session: A ShareRideSession instance.
            economy_fare: The base Economy fare for the route (Decimal or numeric).

        Returns:
            bool: True if driver earnings are protected, False otherwise.
        """
        economy_fare = Decimal(str(economy_fare))
        commission_rate = Decimal(str(session.commission_rate))

        # What the driver would earn on a single Economy ride
        economy_driver_earnings = economy_fare * (Decimal("1") - commission_rate)
        economy_driver_earnings = economy_driver_earnings.quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )

        # What the driver actually earns from the Share session
        share_driver_earnings = self.calculate_driver_earnings(session)

        is_protected = share_driver_earnings >= economy_driver_earnings

        if not is_protected:
            logger.warning(
                "Driver earnings NOT protected for session #%d: "
                "share_earnings=%s < economy_earnings=%s",
                session.id,
                share_driver_earnings,
                economy_driver_earnings,
            )

        return is_protected

    # ─── Private helpers ──────────────────────────────────────────────────

    def _sum_active_fares(self, session):
        """Sum fares of all non-cancelled rides in the session."""
        from django.db.models import Sum

        result = session.active_rides.aggregate(total=Sum("fare"))
        total = result["total"] or Decimal("0")
        return Decimal(str(total))
