"""Mauritania delivery service cities — all wilayas and major urban centers."""

DEFAULT_DELIVERY_CITY = "Nouakchott"

# Wilaya capitals first, then other major cities (canonical spellings).
MAURITANIA_WILAYAS = [
    ("Nouakchott", ["Nouakchott"]),
    ("Dakhlet Nouadhibou", ["Nouadhibou", "Chami"]),
    ("Adrar", ["Atar", "Chinguetti", "Ouadane", "Aoujeft"]),
    ("Inchiri", ["Akjoujt", "Benichab", "Mhaijratt"]),
    ("Trarza", ["Rosso", "Boutilimit", "Keur Macene", "Mederdra", "R'Kiz", "Wad Naga", "Tiguent", "Tekane"]),
    ("Brakna", ["Aleg", "Boghe", "Bababe", "Magta Lahjar", "Male", "M'Bagne"]),
    ("Gorgol", ["Kaedi", "Maghama", "Toulel", "M'Bout", "Monguel"]),
    ("Guidimakha", ["Selibaby", "Ould Yenge", "Wompou", "Ghabou"]),
    ("Assaba", ["Kiffa", "Guerou", "Barkeol", "Kankossa", "Boumdeid"]),
    ("Hodh El Gharbi", ["Aioun el Atrouss", "Tintane", "Kobeni", "Tamchekett", "Touil"]),
    ("Hodh Ech Chargui", ["Nema", "Bassiknou", "Djiguenni", "Amourj", "Adel Bagrou", "Timbedra", "Oualata"]),
    ("Tagant", ["Tidjikja", "Tichit", "Moudjeria"]),
    ("Tiris Zemmour", ["Zouerate", "F'Derik", "Bir Moghrein"]),
]

PRIMARY_DELIVERY_CITIES = [cities[0] for _, cities in MAURITANIA_WILAYAS]

MAURITANIA_DELIVERY_CITIES = []
for _, cities in MAURITANIA_WILAYAS:
    for city in cities:
        if city not in MAURITANIA_DELIVERY_CITIES:
            MAURITANIA_DELIVERY_CITIES.append(city)

_CITY_ALIASES = {
    "kaédi": "Kaedi",
    "kaedi": "Kaedi",
    "aioun": "Aioun el Atrouss",
    "aïoun": "Aioun el Atrouss",
    "aioun el atrouss": "Aioun el Atrouss",
    "sélibaby": "Selibaby",
    "selibaby": "Selibaby",
    "zouérat": "Zouerate",
    "zouerate": "Zouerate",
    "néma": "Nema",
    "nema": "Nema",
    "keur macène": "Keur Macene",
    "keur macene": "Keur Macene",
    "ouad naga": "Wad Naga",
    "wad naga": "Wad Naga",
    "boghé": "Boghe",
    "boghe": "Boghe",
    "bababé": "Bababe",
    "bababe": "Bababe",
    "barkéol": "Barkeol",
    "barkeol": "Barkeol",
    "ould yengé": "Ould Yenge",
    "ould yenge": "Ould Yenge",
    "f'dérik": "F'Derik",
    "f'derik": "F'Derik",
    "m'bout": "M'Bout",
    "m'bagne": "M'Bagne",
}

_CITY_LOOKUP = {name.casefold(): name for name in MAURITANIA_DELIVERY_CITIES}
_CITY_LOOKUP.update(_CITY_ALIASES)


def normalize_city_name(value: str) -> str | None:
    """Return canonical city name or None if invalid."""
    if not value:
        return None
    return _CITY_LOOKUP.get(str(value).strip().casefold())


def canonical_delivery_city_name(city) -> str | None:
    """Operating-city name stored on the user, or None when it is not a delivery city."""
    if city is None:
        return None
    return normalize_city_name(getattr(city, "name", "") or "")


def sync_onboarding_delivery_cities(user) -> None:
    """Point a not-yet-approved courier's service cities at the city on their profile.

    Approved couriers keep the cities already stored. Nothing is written when
    the profile city is already the service city.
    """
    from taxi.drivers.models import DriverProfile

    from .models import DriverDeliverySettings

    try:
        profile = user.driver_profile
    except DriverProfile.DoesNotExist:
        profile = None
    if profile is not None and profile.status == "approved":
        return

    name = canonical_delivery_city_name(getattr(user, "city", None))
    if not name:
        return
    settings_obj = DriverDeliverySettings.objects.filter(driver=user).first()
    if settings_obj is None:
        return
    if list(settings_obj.delivery_cities or []) == [name]:
        return
    settings_obj.delivery_cities = [name]
    settings_obj.save(update_fields=["delivery_cities"])


def delivery_cities_for_admin(user, stored, *, approved: bool) -> list[str]:
    """Show the profile city while onboarding still has only the Nouakchott default."""
    stored_list = list(stored or [])
    if approved:
        return stored_list
    name = canonical_delivery_city_name(getattr(user, "city", None))
    if name and stored_list == [DEFAULT_DELIVERY_CITY] and name != DEFAULT_DELIVERY_CITY:
        return [name]
    return stored_list


def normalize_delivery_cities(cities) -> list[str]:
    """Validate and dedupe a list of delivery city names."""
    if not cities:
        return [DEFAULT_DELIVERY_CITY]

    normalized = []
    seen = set()
    for raw in cities:
        name = normalize_city_name(raw)
        if not name or name in seen:
            continue
        seen.add(name)
        normalized.append(name)

    return normalized or [DEFAULT_DELIVERY_CITY]


def courier_serves_city(settings_obj, service_city: str) -> bool:
    """True if courier works in the delivery city."""
    city = normalize_city_name(service_city) or DEFAULT_DELIVERY_CITY
    courier_cities = normalize_delivery_cities(
        getattr(settings_obj, "delivery_cities", None) or []
    )
    return city in courier_cities
