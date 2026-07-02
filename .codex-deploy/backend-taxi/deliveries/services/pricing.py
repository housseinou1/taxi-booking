"""Yala Delivery pricing engine.

Calculates fares from category base, tiered distance, courier multiplier,
extras, surges, and promotions.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

TWO_PLACES = Decimal("0.01")

# ── Base fare by category (MRU) ───────────────────────────────────────────────
CATEGORY_BASE_FEES = {
    "food": Decimal("40"),
    "pharmacy": Decimal("50"),
    "grocery": Decimal("60"),
    "package": Decimal("70"),
    "documents": Decimal("35"),
    "shopping": Decimal("65"),
    # Extended categories map to closest tier
    "restaurant": Decimal("40"),
    "market": Decimal("60"),
    "household": Decimal("60"),
    "business": Decimal("70"),
    "courier": Decimal("70"),
    "document": Decimal("35"),
}

# ── Package size add-ons (MRU) ────────────────────────────────────────────────
PACKAGE_SIZE_FEES = {
    "document": Decimal("0"),
    "small": Decimal("0"),
    "medium": Decimal("20"),
    "large": Decimal("40"),
    "extra_large": Decimal("80"),
}

# ── Courier type multipliers ───────────────────────────────────────────────────
COURIER_MULTIPLIERS = {
    "bicycle": Decimal("1.0"),
    "motorcycle": Decimal("1.2"),
    "car": Decimal("1.5"),
}

# ── Extra charges (MRU) ───────────────────────────────────────────────────────
URGENT_SURCHARGE = Decimal("30")
FRAGILE_SURCHARGE = Decimal("20")
HEAVY_SURCHARGE = Decimal("25")
EXTRA_STOP_FEE = Decimal("25")
WAITING_FREE_MINUTES = 5
WAITING_RATE_PER_MINUTE = Decimal("10")

NIGHT_SURGE_RATE = Decimal("0.15")  # +15%
HEAVY_WEIGHT_KG = Decimal("15")

DRIVER_EARNING_RATE = Decimal("0.80")
PLATFORM_COMMISSION_RATE = Decimal("0.20")


def normalize_courier_type(courier_type: str) -> str:
    value = (courier_type or "motorcycle").strip().lower()
    if value in {"vehicle", "van"}:
        return "car"
    return value if value in COURIER_MULTIPLIERS else "motorcycle"


def calculate_tiered_distance_fee(distance_km: Decimal) -> Decimal:
    """Tiered distance pricing after base fare (0–3 km included in base)."""
    distance = max(Decimal(str(distance_km)), Decimal("0"))
    if distance <= Decimal("3"):
        return Decimal("0")

    fee = Decimal("0")

    if distance > Decimal("3"):
        km = min(distance, Decimal("10")) - Decimal("3")
        fee += km * Decimal("8")

    if distance > Decimal("10"):
        km = min(distance, Decimal("25")) - Decimal("10")
        fee += km * Decimal("12")

    if distance > Decimal("25"):
        km = distance - Decimal("25")
        fee += km * Decimal("18")

    return fee.quantize(TWO_PLACES, ROUND_HALF_UP)


def is_night_delivery(when: Optional[datetime] = None) -> bool:
    """Night delivery window: 10 PM – 6 AM."""
    moment = when or datetime.now()
    hour = moment.hour
    return hour >= 22 or hour < 6


def clamp_surge_percent(value) -> Decimal:
    try:
        pct = Decimal(str(value))
    except Exception:
        return Decimal("0")
    return max(Decimal("0"), min(pct, Decimal("50")))


@dataclass
class FareBreakdown:
    """Detailed fare breakdown for a delivery."""

    base_fee: Decimal
    distance_fee: Decimal
    package_size_fee: Decimal
    urgent_surcharge: Decimal
    fragile_surcharge: Decimal
    heavy_surcharge: Decimal
    waiting_fee: Decimal
    night_surcharge: Decimal
    weather_surge: Decimal
    demand_surge: Decimal
    extra_stop_fee: Decimal
    courier_multiplier: Decimal
    subtotal_before_multiplier: Decimal
    subtotal_after_multiplier: Decimal
    discount_amount: Decimal
    total_fare: Decimal
    platform_commission: Decimal
    driver_earning: Decimal
    promo_code: str = ""
    promo_message: str = ""
    # Legacy aliases kept for serializers / admin
    category_surcharge: Decimal = field(default_factory=lambda: Decimal("0"))
    express_surcharge: Decimal = field(default_factory=lambda: Decimal("0"))
    fragile_surcharge_legacy: Decimal = field(default_factory=lambda: Decimal("0"))

    @property
    def surge_surcharge(self) -> Decimal:
        return (self.weather_surge + self.demand_surge).quantize(TWO_PLACES, ROUND_HALF_UP)

    @property
    def extra_charges_total(self) -> Decimal:
        return (
            self.package_size_fee
            + self.urgent_surcharge
            + self.fragile_surcharge
            + self.heavy_surcharge
            + self.waiting_fee
            + self.extra_stop_fee
        ).quantize(TWO_PLACES, ROUND_HALF_UP)

    def as_dict(self):
        return {
            "base_fee": str(self.base_fee),
            "distance_fee": str(self.distance_fee),
            "package_size_fee": str(self.package_size_fee),
            "urgent_surcharge": str(self.urgent_surcharge),
            "fragile_surcharge": str(self.fragile_surcharge),
            "heavy_surcharge": str(self.heavy_surcharge),
            "waiting_fee": str(self.waiting_fee),
            "night_surcharge": str(self.night_surcharge),
            "weather_surge": str(self.weather_surge),
            "demand_surge": str(self.demand_surge),
            "surge_surcharge": str(self.surge_surcharge),
            "extra_stop_fee": str(self.extra_stop_fee),
            "extra_charges_total": str(self.extra_charges_total),
            "courier_multiplier": str(self.courier_multiplier),
            "subtotal_before_multiplier": str(self.subtotal_before_multiplier),
            "subtotal_after_multiplier": str(self.subtotal_after_multiplier),
            "discount_amount": str(self.discount_amount),
            "platform_commission": str(self.platform_commission),
            "app_fee": str(self.platform_commission),
            "driver_earning": str(self.driver_earning),
            "courier_earning": str(self.driver_earning),
            "total_fare": str(self.total_fare),
            "promo_code": self.promo_code,
            "promo_message": self.promo_message,
            # Legacy keys
            "category_surcharge": str(self.category_surcharge),
            "express_surcharge": str(self.express_surcharge),
        }


class DeliveryPricingService:
    """Calculates delivery fares with full breakdown."""

    def get_category_base_fee(self, service_category: str) -> Decimal:
        from ..categories import LEGACY_CATEGORY_ALIASES, normalize_service_category

        category = normalize_service_category(service_category)
        if category in CATEGORY_BASE_FEES:
            return CATEGORY_BASE_FEES[category]
        alias = LEGACY_CATEGORY_ALIASES.get((service_category or "").lower())
        if alias and alias in CATEGORY_BASE_FEES:
            return CATEGORY_BASE_FEES[alias]
        return CATEGORY_BASE_FEES["package"]

    def get_package_size_fee(self, package_type: str) -> Decimal:
        key = (package_type or "small").lower()
        return PACKAGE_SIZE_FEES.get(key, Decimal("0"))

    def is_heavy_package(self, package_type: str, weight_kg=None) -> bool:
        if weight_kg is not None:
            try:
                if Decimal(str(weight_kg)) >= HEAVY_WEIGHT_KG:
                    return True
            except Exception:
                pass
        return (package_type or "").lower() in {"large", "extra_large"}

    def calculate_waiting_fee(self, waiting_minutes: int = 0) -> Decimal:
        minutes = max(int(waiting_minutes or 0), 0)
        billable = max(0, minutes - WAITING_FREE_MINUTES)
        return (Decimal(billable) * WAITING_RATE_PER_MINUTE).quantize(TWO_PLACES, ROUND_HALF_UP)

    def apply_promo_discount(
        self,
        subtotal: Decimal,
        promo_code: str,
        rider=None,
        city=None,
    ) -> tuple[Decimal, str, str]:
        code = (promo_code or "").strip().upper()
        if not code or not rider:
            return Decimal("0"), "", ""

        try:
            from promotions.services.promo_code_service import PromoCodeService

            service = PromoCodeService()
            result = service.validate_code(code, rider, subtotal, city=city)
            if result.valid:
                return result.discount_amount, code, result.message or "Promo applied"
            return Decimal("0"), code, result.message or "Promo not valid"
        except Exception:
            return Decimal("0"), code, ""

    def calculate_fare(
        self,
        service_category: str,
        package_type: str,
        distance_km: Decimal,
        courier_type: str = "motorcycle",
        stops_count: int = 1,
        fragile: bool = False,
        urgent: bool = False,
        weight_kg=None,
        waiting_minutes: int = 0,
        weather_surge_percent: Decimal | float = 0,
        demand_surge_percent: Decimal | float = 0,
        at_time: Optional[datetime] = None,
        promo_code: str = "",
        rider=None,
        city=None,
        business_account=None,
    ) -> FareBreakdown:
        distance_km = max(Decimal(str(distance_km)), Decimal("0"))
        courier_key = normalize_courier_type(courier_type)
        multiplier = COURIER_MULTIPLIERS.get(courier_key, Decimal("1.2"))

        base_fee = self.get_category_base_fee(service_category)
        distance_fee = calculate_tiered_distance_fee(distance_km)
        package_size_fee = self.get_package_size_fee(package_type)

        urgent_fee = URGENT_SURCHARGE if urgent else Decimal("0")
        fragile_fee = FRAGILE_SURCHARGE if fragile else Decimal("0")
        heavy_fee = HEAVY_SURCHARGE if self.is_heavy_package(package_type, weight_kg) else Decimal("0")
        waiting_fee = self.calculate_waiting_fee(waiting_minutes)

        extra_stops = max(0, int(stops_count) - 1)
        extra_stop_fee = (EXTRA_STOP_FEE * extra_stops).quantize(TWO_PLACES, ROUND_HALF_UP)

        core = (
            base_fee
            + distance_fee
            + package_size_fee
            + urgent_fee
            + fragile_fee
            + heavy_fee
            + waiting_fee
            + extra_stop_fee
        )

        night_fee = Decimal("0")
        if is_night_delivery(at_time):
            night_fee = (core * NIGHT_SURGE_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)

        weather_pct = clamp_surge_percent(weather_surge_percent)
        if weather_pct > Decimal("25"):
            weather_pct = Decimal("25")
        demand_pct = clamp_surge_percent(demand_surge_percent)

        weather_surge = (core * weather_pct / Decimal("100")).quantize(TWO_PLACES, ROUND_HALF_UP)
        demand_surge = (core * demand_pct / Decimal("100")).quantize(TWO_PLACES, ROUND_HALF_UP)

        subtotal_before_multiplier = core + night_fee + weather_surge + demand_surge
        subtotal_after_multiplier = (subtotal_before_multiplier * multiplier).quantize(
            TWO_PLACES, ROUND_HALF_UP
        )

        discount = Decimal("0")
        promo_message = ""
        applied_code = ""

        if business_account and business_account.is_active:
            discount = (subtotal_after_multiplier * business_account.discount_percentage / Decimal("100")).quantize(
                TWO_PLACES, ROUND_HALF_UP
            )
            promo_message = f"Business discount {business_account.discount_percentage}%"
        elif promo_code and rider:
            promo_discount, applied_code, promo_message = self.apply_promo_discount(
                subtotal_after_multiplier, promo_code, rider=rider, city=city
            )
            discount = promo_discount

        total_fare = max(subtotal_after_multiplier - discount, Decimal("0")).quantize(
            TWO_PLACES, ROUND_HALF_UP
        )
        driver_earning = (total_fare * DRIVER_EARNING_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)
        platform_commission = (total_fare * PLATFORM_COMMISSION_RATE).quantize(
            TWO_PLACES, ROUND_HALF_UP
        )

        return FareBreakdown(
            base_fee=base_fee,
            distance_fee=distance_fee,
            package_size_fee=package_size_fee,
            urgent_surcharge=urgent_fee,
            fragile_surcharge=fragile_fee,
            heavy_surcharge=heavy_fee,
            waiting_fee=waiting_fee,
            night_surcharge=night_fee,
            weather_surge=weather_surge,
            demand_surge=demand_surge,
            extra_stop_fee=extra_stop_fee,
            courier_multiplier=multiplier,
            subtotal_before_multiplier=subtotal_before_multiplier,
            subtotal_after_multiplier=subtotal_after_multiplier,
            discount_amount=discount,
            total_fare=total_fare,
            platform_commission=platform_commission,
            driver_earning=driver_earning,
            promo_code=applied_code,
            promo_message=promo_message,
            express_surcharge=urgent_fee,
        )

    def calculate_driver_earning(self, fare: Decimal) -> Decimal:
        return (Decimal(str(fare)) * DRIVER_EARNING_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)

    def calculate_platform_commission(self, fare: Decimal) -> Decimal:
        return (Decimal(str(fare)) * PLATFORM_COMMISSION_RATE).quantize(TWO_PLACES, ROUND_HALF_UP)
