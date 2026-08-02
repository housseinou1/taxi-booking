from decimal import Decimal, ROUND_HALF_UP
import os


def get_app_fee_percent():
    raw_percent = os.getenv("APP_FEE_PERCENT", "30")
    percent = Decimal(str(raw_percent))

    if percent > 1:
        percent = percent / Decimal("100")

    return percent.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


MARKET = {
    "country": "Mauritania",
    "currency": "MRU",
    "timezone": "Africa/Nouakchott",
    "default_city": "Nouakchott",
    "phone_prefix": "+222",
    "private_call_number": os.getenv("PRIVATE_CALL_NUMBER", "+22245000001"),
    "default_pickup": "Sebkha",
    "default_destination": "Toujounine",
    "default_pickup_lat": 18.0735,
    "default_pickup_lng": -15.9582,
    "default_destination_lat": 18.0896,
    "default_destination_lng": -15.9754,
    "app_fee_percent": get_app_fee_percent(),
    "fare": {
        # Base fares are also the minimum fares. Values approved Mission 16.
        "regular": {"base": Decimal("175"), "per_km": Decimal("20")},
        "xl": {"base": Decimal("225"), "per_km": Decimal("25")},
        "comfort": {"base": Decimal("275"), "per_km": Decimal("30")},
        "share": {"base": Decimal("150"), "per_km": Decimal("15")},
    },
    "waiting": {
        "free_minutes": 3,
        "per_minute_fee": Decimal("50"),
        # Total wait from driver_arrived_at before Rider no-show unlocks.
        "max_wait_minutes": 5,
        # GPS radius for arrive / no-show anti-abuse.
        "arrive_max_distance_m": 350,
        "no_show_max_distance_m": 150,
    },
    "no_show": {
        # Fee charged to the rider when the driver completes a valid no-show cancel.
        "rider_fee": Decimal("75"),
        # Driver compensation credited on a valid rider no-show.
        "driver_compensation": Decimal("75"),
    },
    "cancellation": {
        # Free cancellation window from ride creation.
        "free_window_minutes": 2,
        # Fee charged to a rider who cancels after driver accepted / en route.
        "en_route_fee": Decimal("50"),
        # Fee charged to a rider who cancels after driver arrived and free wait expired.
        "arrived_fee": Decimal("75"),
        # Driver-side standard cancellation penalty (unchanged).
        "driver_penalty": Decimal("150"),
    },
    "rewards": {
        # Driver reward points (Uber Pro / Lyft Rewards style).
        "points": {
            "ride_complete": 10,
            "five_star_rating": 5,
            "peak_hour_ride": 3,
            "airport_ride": 5,
            "long_distance_ride": 5,
            "referral_completed": 50,
            "driver_cancellation": -3,
            "fraud_confirmed": -20,
            "unsafe_driving_complaint": -10,
        },
        # Local peak hours (Africa/Nouakchott) — morning and evening rush.
        "peak_hours": [(7, 10), (17, 21)],
        "long_distance_km": 15,
        "airport_keywords": [
            "airport",
            "aeroport",
            "aéroport",
            "nouakchott airport",
            "aeroport de nouakchott",
        ],
        "tiers": [
            (0, "bronze", "Bronze"),
            (1000, "silver", "Silver"),
            (3000, "gold", "Gold"),
            (7000, "platinum", "Platinum"),
            (12000, "diamond", "Diamond"),
        ],
    },
}


def calculate_fare(ride_type, distance_km):
    pricing = MARKET["fare"].get(str(ride_type).lower(), MARKET["fare"]["regular"])
    distance = max(Decimal(str(distance_km or 0)), Decimal("0"))
    fare = pricing["base"] + (distance * pricing["per_km"])
    fare = max(fare, pricing["base"])
    return fare.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_app_fee(fare):
    amount = Decimal(str(fare or 0)) * MARKET["app_fee_percent"]
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_app_fee_percent_display():
    return (MARKET["app_fee_percent"] * Decimal("100")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
