from decimal import Decimal

from cities.models import City, Region

from .models import AirportLocation

DEFAULT_AIRPORTS = (
    {
        "name": "Nouakchott-Oumtounsy International Airport (NKC)",
        "latitude": 18.3107,
        "longitude": -15.9697,
        "terminal_info": "International terminal",
        "pickup_instructions": "Meet at arrivals gate outside the main exit.",
        "surcharge": Decimal("0"),
    },
    {
        "name": "Nouakchott Airport (Legacy)",
        "latitude": 18.0980,
        "longitude": -15.9730,
        "terminal_info": "Legacy domestic terminal",
        "pickup_instructions": "Meet at the terminal entrance.",
        "surcharge": Decimal("0"),
    },
)


def _ensure_nouakchott_city():
    region, _ = Region.objects.get_or_create(
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "is_active": True,
        },
    )
    city, _ = City.objects.get_or_create(
        region=region,
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "latitude": 18.0735,
            "longitude": -15.9582,
            "is_active": True,
        },
    )
    return city


def ensure_default_airports():
    city = City.objects.filter(name__iexact="Nouakchott", is_active=True).first()
    if not city:
        city = _ensure_nouakchott_city()

    created_or_existing = []
    for spec in DEFAULT_AIRPORTS:
        airport, _ = AirportLocation.objects.get_or_create(
            name=spec["name"],
            city=city,
            defaults={
                **spec,
                "is_active": True,
            },
        )
        created_or_existing.append(airport)
    return created_or_existing


def resolve_airport(*, airport_id=None, airport_name=None):
    ensure_default_airports()

    if airport_id not in (None, ""):
        airport_id_text = str(airport_id).strip()
        if airport_id_text.isdigit():
            return AirportLocation.objects.filter(id=int(airport_id_text), is_active=True).first()

    if airport_name:
        normalized_name = str(airport_name).strip()
        airport = AirportLocation.objects.filter(name__iexact=normalized_name, is_active=True).first()
        if airport:
            return airport

        for spec in DEFAULT_AIRPORTS:
            if spec["name"] == normalized_name or normalized_name in spec["name"]:
                return AirportLocation.objects.filter(name=spec["name"], is_active=True).first()

    return None
