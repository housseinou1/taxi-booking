from decimal import Decimal, ROUND_HALF_UP


MARKET = {
    "country": "Mauritania",
    "currency": "MRU",
    "timezone": "Africa/Nouakchott",
    "default_city": "Nouakchott",
    "phone_prefix": "+222",
    "default_pickup": "Sebkha",
    "default_destination": "Toujounine",
    "default_pickup_lat": 18.0735,
    "default_pickup_lng": -15.9582,
    "default_destination_lat": 18.0896,
    "default_destination_lng": -15.9754,
    "app_fee_percent": Decimal("0.20"),
    "fare": {
        "regular": {"base": Decimal("200"), "per_km": Decimal("20")},
        "xl": {"base": Decimal("300"), "per_km": Decimal("30")},
        "comfort": {"base": Decimal("350"), "per_km": Decimal("35")},
        "share": {"base": Decimal("150"), "per_km": Decimal("15")},
    },
}


def calculate_fare(ride_type, distance_km):
    pricing = MARKET["fare"].get(str(ride_type).lower(), MARKET["fare"]["regular"])
    distance = Decimal(str(distance_km or 0))
    fare = pricing["base"] + (distance * pricing["per_km"])
    return fare.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_app_fee(fare):
    amount = Decimal(str(fare or 0)) * MARKET["app_fee_percent"]
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
