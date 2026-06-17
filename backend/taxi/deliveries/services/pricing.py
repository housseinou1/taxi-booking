"""Delivery pricing engine.

Calculates fares based on service category, distance, surcharges, and discounts.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")

# Base fees by category (MRU)
CATEGORY_BASE_FEES = {
    "document": Decimal("40"),
    "small": Decimal("60"),
    "medium": Decimal("100"),
    "large": Decimal("180"),
    "food": Decimal("80"),
    "pharmacy": Decimal("70"),
    "shopping": Decimal("90"),
}

# Also map package_type to same base fees for backward compat
PACKAGE_TYPE_BASE_FEES = {
    "document": Decimal("40"),
    "small": Decimal("60"),
    "medium": Decimal("100"),
    "large": Decimal("180"),
}

DISTANCE_RATE_PER_KM = Decimal("22")
FRAGILE_SURCHARGE = Decimal("30")
EXPRESS_SURCHARGE = Decimal("50")
EXTRA_STOP_FEE = Decimal("25")
DRIVER_EARNING_RATE = Decimal("0.80")
PLATFORM_COMMISSION_RATE = Decimal("0.20")


@dataclass
class FareBreakdown:
    """Detailed fare breakdown for a delivery."""

    base_fee: Decimal
    distance_fee: Decimal
    category_surcharge: Decimal
    extra_stop_fee: Decimal
    express_surcharge: Decimal
    fragile_surcharge: Decimal
    discount_amount: Decimal
    total_fare: Decimal
    driver_earning: Decimal
    platform_commission: Decimal

    def as_dict(self):
        return {
            "base_fee": str(self.base_fee),
            "distance_fee": str(self.distance_fee),
            "category_surcharge": str(self.category_surcharge),
            "extra_stop_fee": str(self.extra_stop_fee),
            "express_surcharge": str(self.express_surcharge),
            "fragile_surcharge": str(self.fragile_surcharge),
            "discount_amount": str(self.discount_amount),
            "total_fare": str(self.total_fare),
            "driver_earning": str(self.driver_earning),
            "platform_commission": str(self.platform_commission),
        }


class DeliveryPricingService:
    """Calculates delivery fares with full breakdown."""

    def get_base_fee(self, service_category: str, package_type: str = "") -> Decimal:
        """Get base fee from service category, falling back to package_type."""
        if service_category in CATEGORY_BASE_FEES:
            return CATEGORY_BASE_FEES[service_category]
        if package_type in PACKAGE_TYPE_BASE_FEES:
            return PACKAGE_TYPE_BASE_FEES[package_type]
        return Decimal("60")  # default to small package

    def calculate_fare(
        self,
        service_category: str,
        package_type: str,
        distance_km: Decimal,
        stops_count: int = 1,
        fragile: bool = False,
        express: bool = False,
        business_account=None,
    ) -> FareBreakdown:
        """Calculate full fare with all surcharges and discounts.

        Args:
            service_category: One of food, package, document, pharmacy, shopping.
            package_type: One of document, small, medium, large.
            distance_km: Distance in kilometers.
            stops_count: Total number of delivery stops (1 = single destination).
            fragile: Whether fragile handling is required.
            express: Whether this is an express/same-day scheduled delivery.
            business_account: Optional BusinessAccount for discount.

        Returns:
            FareBreakdown with all components.
        """
        distance_km = max(Decimal(str(distance_km)), Decimal("0"))

        base_fee = self.get_base_fee(service_category, package_type)
        distance_fee = (distance_km * DISTANCE_RATE_PER_KM).quantize(TWO_PLACES, ROUND_HALF_UP)

        # Category surcharge is 0 — already included in base_fee per category
        category_surcharge = Decimal("0")

        # Extra stop fee: 25 MRU per stop beyond the first
        extra_stops = max(0, stops_count - 1)
        extra_stop_fee = (EXTRA_STOP_FEE * extra_stops).quantize(TWO_PLACES)

        fragile_fee = FRAGILE_SURCHARGE if fragile else Decimal("0")
        express_fee = EXPRESS_SURCHARGE if express else Decimal("0")

        subtotal = base_fee + distance_fee + category_surcharge + extra_stop_fee + fragile_fee + express_fee

        # Business account discount
        discount = Decimal("0")
        if business_account and business_account.is_active:
            discount = (subtotal * business_account.discount_percentage / Decimal("100")).quantize(
                TWO_PLACES, ROUND_HALF_UP
            )

        total_fare = (subtotal - discount).quantize(TWO_PLACES, ROUND_HALF_UP)
        total_fare = max(total_fare, Decimal("0"))

        driver_earning = (total_fare * DRIVER_EARNING_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)
        platform_commission = (total_fare * PLATFORM_COMMISSION_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)

        return FareBreakdown(
            base_fee=base_fee,
            distance_fee=distance_fee,
            category_surcharge=category_surcharge,
            extra_stop_fee=extra_stop_fee,
            express_surcharge=express_fee,
            fragile_surcharge=fragile_fee,
            discount_amount=discount,
            total_fare=total_fare,
            driver_earning=driver_earning,
            platform_commission=platform_commission,
        )

    def calculate_driver_earning(self, fare: Decimal) -> Decimal:
        """Driver gets 80% of the fare."""
        return (Decimal(str(fare)) * DRIVER_EARNING_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)

    def calculate_platform_commission(self, fare: Decimal) -> Decimal:
        """Platform takes 20% of the fare."""
        return (Decimal(str(fare)) * PLATFORM_COMMISSION_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)
