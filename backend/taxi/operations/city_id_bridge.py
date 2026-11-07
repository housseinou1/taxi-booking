"""Translate between ``locations.City`` (rides, ops) and ``cities.City`` (user registry).

``authapp.User.city`` points at ``cities.City``. ``Ride.city`` points at ``locations.City``.
Primary keys differ; matching is done by name + region name except for Nouakchott:

For **Nouakchott**, administrative rows may exist under multiple ``locations.Region`` records
(Nord/Ouest/Sud). YALA operations treat **one unified Nouakchott**: any driver whose registry
city name is "Nouakchott" is eligible for rides tagged with any locations.City named
"Nouakchott".
"""

from __future__ import annotations

from cities.models import City as RegistryCity
from locations.models import City as LocationCity


def _strip(s: str | None) -> str:
    return (s or "").strip()


def registry_city_ids_for_location_city(location: LocationCity) -> list[int]:
    """Return ``cities.City`` ids that represent the same operating city as ``location``."""
    city_name = _strip(location.name)
    if city_name.casefold() == "nouakchott":
        return list(RegistryCity.objects.filter(name__iexact="Nouakchott").values_list("id", flat=True))

    region_name = _strip(getattr(location.region, "name", None))
    ids: list[int] = []
    for reg in RegistryCity.objects.filter(name__iexact=city_name).select_related("region"):
        reg_r = _strip(getattr(reg.region, "name", None))
        if reg_r.casefold() == region_name.casefold():
            ids.append(reg.id)
    return ids


def registry_city_ids_for_location_city_id(location_city_id: int | None) -> list[int]:
    if not location_city_id:
        return []
    loc = (
        LocationCity.objects.filter(pk=location_city_id)
        .select_related("region")
        .first()
    )
    if loc is None:
        return []
    return registry_city_ids_for_location_city(loc)


def user_registry_matches_location_city(user, location_city_id: int | None) -> bool:
    """True if the user's registry city authorizes local operations in ``location_city_id``."""
    if not location_city_id or not getattr(user, "city_id", None):
        return True
    allowed = registry_city_ids_for_location_city_id(location_city_id)
    if not allowed:
        return False
    return user.city_id in allowed
