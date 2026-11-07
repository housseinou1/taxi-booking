"""Ensure the 13 operating metros exist as ``locations.City`` rows (local/dev DB repair)."""

from __future__ import annotations

from django.utils.text import slugify

from locations.models import City as LocationCity
from locations.models import Region
from locations.operating_cities import OPERATING_METRO_SPECS, canonical_operating_name, invalidate_operating_city_cache

# Canonical metro → primary ``locations.Region.name`` (matches 0001_initial seed).
_METRO_REGION: dict[str, str] = {
    "Nouakchott": "Nouakchott",
    "Nouadhibou": "Dakhlet Nouadhibou",
    "Rosso": "Trarza",
    "Atar": "Adrar",
    "Kaédi": "Gorgol",
    "Kiffa": "Assaba",
    "Néma": "Hodh Ech Chargui",
    "Aïoun": "Hodh El Gharbi",
    "Aleg": "Brakna",
    "Tidjikja": "Tagant",
    "Sélibaby": "Guidimaka",
    "Zouerate": "Tiris Zemmour",
    "Akjoujt": "Inchiri",
}

# Display name on the ``City`` row when it must be created (aligns with historical seed spellings).
_METRO_CITY_LABEL: dict[str, str] = {
    "Aïoun": "Aioun",
    "Zouerate": "Zouérat",
}


def _city_for_canonical(canon: str) -> LocationCity | None:
    for city in LocationCity.objects.select_related("region").filter(region__is_active=True):
        if canonical_operating_name(city.name) == canon:
            return city
    return None


def ensure_operating_metro_cities() -> int:
    """Create or re-activate missing operating metros; returns rows touched (new + re-enabled)."""
    touched = 0
    for canonical, _aliases in OPERATING_METRO_SPECS:
        existing = _city_for_canonical(canonical)
        if existing is not None:
            if not existing.is_active:
                existing.is_active = True
                existing.save(update_fields=["is_active"])
                touched += 1
            continue

        region_name = _METRO_REGION.get(canonical)
        if not region_name:
            continue
        region, _ = Region.objects.get_or_create(
            name=region_name,
            defaults={"slug": slugify(region_name), "is_active": True},
        )
        if not region.is_active:
            region.is_active = True
            region.save(update_fields=["is_active"])

        label = _METRO_CITY_LABEL.get(canonical, canonical)
        base_slug = slugify(f"{region_name}-{label}")[:120]
        slug = base_slug
        n = 1
        while LocationCity.objects.filter(slug=slug).exists():
            n += 1
            slug = f"{base_slug}-{n}"[:140]

        LocationCity.objects.create(
            region=region,
            name=label,
            slug=slug,
            is_active=True,
            is_default=canonical == "Nouakchott",
        )
        touched += 1

    if touched:
        invalidate_operating_city_cache()
    return touched
