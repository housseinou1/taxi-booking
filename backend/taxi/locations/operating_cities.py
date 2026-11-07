"""YALA initial operating metros — resolves ``locations.City`` rows by name (not hardcoded PKs).

Smaller towns remain in the database for future expansion but are excluded from the
operating-city catalog returned to admin UIs and from dispatch eligibility for new offers.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache

from django.db.models import QuerySet

from locations.models import City as LocationCity
from operations.city_id_bridge import registry_city_ids_for_location_city

# Canonical display order (names used for matching only — IDs come from the database).
OPERATING_METRO_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Nouakchott", ("nouakchott",)),
    ("Nouadhibou", ("nouadhibou",)),
    ("Rosso", ("rosso",)),
    ("Atar", ("atar",)),
    ("Kaédi", ("kaedi", "kaédi")),
    ("Kiffa", ("kiffa",)),
    ("Néma", ("nema", "néma")),
    ("Aïoun", ("aioun", "aïoun", "aioun el atrouss")),
    ("Aleg", ("aleg",)),
    ("Tidjikja", ("tidjikja",)),
    ("Sélibaby", ("selibaby", "sélibaby")),
    ("Zouerate", ("zouerate", "zouerat", "zouérat")),
    ("Akjoujt", ("akjoujt",)),
)

_ORDER_BY_CANONICAL = {spec[0]: index for index, spec in enumerate(OPERATING_METRO_SPECS)}


def _normalize_key(name: str | None) -> str:
    text = unicodedata.normalize("NFD", (name or "").strip())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.lower().replace("-", " ").split())


_ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canonical, _aliases in OPERATING_METRO_SPECS:
    _ALIAS_TO_CANONICAL[_normalize_key(_canonical)] = _canonical
    for _alias in _aliases:
        _ALIAS_TO_CANONICAL[_normalize_key(_alias)] = _canonical


def canonical_operating_name(name: str | None) -> str | None:
    key = _normalize_key(name)
    if not key:
        return None
    if key in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[key]
    if key.startswith("nouakchott"):
        return "Nouakchott"
    if key.startswith("aioun"):
        return "Aïoun"
    return None


def is_operating_metro_name(name: str | None) -> bool:
    return canonical_operating_name(name) is not None


@lru_cache(maxsize=1)
def _operating_location_city_ids_frozen() -> frozenset[int]:
    return frozenset(row["id"] for row in build_operating_city_payload())


def operating_location_city_ids() -> set[int]:
    return set(_operating_location_city_ids_frozen())


def is_operating_location_city_id(city_id: int | None) -> bool:
    if not city_id:
        return False
    return int(city_id) in _operating_location_city_ids_frozen()


def invalidate_operating_city_cache() -> None:
    _operating_location_city_ids_frozen.cache_clear()
    build_operating_city_payload.cache_clear()


@lru_cache(maxsize=8)
def build_operating_city_payload() -> tuple[dict, ...]:
    """One row per operating metro with a single unified Nouakchott ``locations.City`` id."""
    active: QuerySet[LocationCity] = LocationCity.objects.select_related("region").filter(
        is_active=True,
        region__is_active=True,
    )
    by_canonical: dict[str, list[LocationCity]] = {spec[0]: [] for spec in OPERATING_METRO_SPECS}
    for city in active:
        canon = canonical_operating_name(city.name)
        if canon:
            by_canonical.setdefault(canon, []).append(city)

    rows: list[dict] = []
    for canonical, _aliases in OPERATING_METRO_SPECS:
        matches = by_canonical.get(canonical) or []
        if not matches:
            continue
        if canonical == "Nouakchott":
            matches.sort(key=lambda c: (not getattr(c, "is_default", False), c.id))
            pick = matches[0]
            display_name = "Nouakchott"
        else:
            matches.sort(key=lambda c: c.id)
            pick = matches[0]
            display_name = pick.name

        reg_ids = registry_city_ids_for_location_city(pick)
        rows.append(
            {
                "id": pick.id,
                "name": display_name,
                "slug": pick.slug,
                "display_order": _ORDER_BY_CANONICAL[canonical],
                "canonical_name": canonical,
                "region": {
                    "id": pick.region_id,
                    "name": getattr(pick.region, "name", ""),
                    "slug": getattr(pick.region, "slug", ""),
                },
                "registry_city_ids": reg_ids,
                "primary_registry_city_id": reg_ids[0] if reg_ids else None,
            }
        )

    rows.sort(key=lambda r: r["display_order"])
    return tuple(rows)
