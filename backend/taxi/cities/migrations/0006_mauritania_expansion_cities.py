"""Register the Mauritania expansion cities (Atar, Kaédi, Sélibaby, Zouérat).

Audit finding: all four cities already exist in the registry (created by
``cities.0003`` / ``cities.0004``) — no duplicate is created here. This
migration is deliberately idempotent and additive:

* it matches an existing city by accent-, case- and punctuation-insensitive
  name, in its region first and then anywhere in the registry;
* it never deletes a city, never changes a primary key, and never re-points a
  region, user, driver, rider or ride relationship;
* it only fills blank metadata, and sets the official French spelling of the
  four expansion cities (``name`` — the canonical key — is left untouched);
* every service/category row it creates is **inactive**, so no city and no
  service begins live operations. Only the Founder/CEO can activate them.

Coordinates are the validated values already used by the platform's earlier
city migrations; nothing is invented here.
"""

from django.db import migrations
import unicodedata

EXPANSION_CITIES = [
    {
        "name": "Atar",
        "name_fr": "Atar",
        "name_ar": "أطار",
        "region": "Adrar",
        "latitude": 20.5169,
        "longitude": -13.0489,
        "code": "ATR",
    },
    {
        "name": "Kaedi",
        "name_fr": "Kaédi",
        "name_ar": "كيهيدي",
        "region": "Gorgol",
        "latitude": 16.1503,
        "longitude": -13.5037,
        "code": "KAE",
    },
    {
        "name": "Selibaby",
        "name_fr": "Sélibaby",
        "name_ar": "سيلبابي",
        "region": "Guidimakha",
        "latitude": 15.15846,
        "longitude": -12.1843,
        "code": "SEL",
    },
    {
        "name": "Zouerate",
        "name_fr": "Zouérat",
        "name_ar": "ازويرات",
        "region": "Tiris Zemmour",
        "latitude": 22.7354,
        "longitude": -12.4783,
        "code": "ZOU",
    },
]

PREVIOUS_FRENCH = {
    "Atar": "Atar",
    "Kaedi": "Kaedi",
    "Selibaby": "Selibaby",
    "Zouerate": "Zouerate",
}

SERVICE_CATALOG = {
    "rider": ["standard", "shared"],
    "driver": ["registration", "availability", "matching"],
    "delivery": ["food", "grocery", "pharmacy", "parcel", "document", "shopping"],
}


def _normalize(value):
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = "".join(ch if ch.isalnum() else " " for ch in stripped.casefold())
    return " ".join(cleaned.split())


def _find_city(City, region, name):
    """Existing city by normalised name: in-region first, then anywhere."""
    key = _normalize(name)
    for candidate in City.objects.filter(region=region):
        if _normalize(candidate.name) == key:
            return candidate
    for candidate in City.objects.all():
        if _normalize(candidate.name) == key:
            return candidate
    return None


def register_expansion_cities(apps, schema_editor):
    Region = apps.get_model("cities", "Region")
    City = apps.get_model("cities", "City")
    CityProfile = apps.get_model("cities", "CityProfile")
    CityServiceConfig = apps.get_model("cities", "CityServiceConfig")

    for entry in EXPANSION_CITIES:
        region, _ = Region.objects.get_or_create(
            name=entry["region"],
            defaults={
                "name_fr": entry["region"],
                "name_ar": entry["region"],
                "is_active": True,
            },
        )

        city = _find_city(City, region, entry["name"])
        if city is None:
            city = City.objects.create(
                region=region,
                name=entry["name"],
                name_fr=entry["name_fr"],
                name_ar=entry["name_ar"],
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                is_active=True,
            )

        # Official French spelling for the expansion cities. The canonical
        # ``name`` and every identifier/relationship stay exactly as they are.
        if city.name_fr != entry["name_fr"]:
            city.name_fr = entry["name_fr"]
            city.save(update_fields=["name_fr"])
        for field, value in (
            ("name_ar", entry["name_ar"]),
            ("latitude", entry["latitude"]),
            ("longitude", entry["longitude"]),
        ):
            if not getattr(city, field):
                setattr(city, field, value)
                city.save(update_fields=[field])

        profile, _ = CityProfile.objects.get_or_create(city=city)
        profile_fields = []
        for field, value in (
            ("country", "Mauritania"),
            ("iso_country_code", "MR"),
            ("timezone", "Africa/Nouakchott"),
            ("code", entry["code"]),
        ):
            if not getattr(profile, field):
                setattr(profile, field, value)
                profile_fields.append(field)
        # Live operations stay closed: ``is_live`` is never set to True here.
        if profile_fields:
            profile.save(update_fields=profile_fields)

        for service, categories in SERVICE_CATALOG.items():
            for category in categories:
                CityServiceConfig.objects.get_or_create(
                    city=city,
                    service=service,
                    category=category,
                    defaults={"is_active": False},
                )


def restore_previous_french(apps, schema_editor):
    """Reverse: put back the pre-expansion French spellings."""
    City = apps.get_model("cities", "City")
    for name, previous in PREVIOUS_FRENCH.items():
        key = _normalize(name)
        for city in City.objects.all():
            if _normalize(city.name) == key and city.name_fr != previous:
                city.name_fr = previous
                city.save(update_fields=["name_fr"])


class Migration(migrations.Migration):
    dependencies = [
        ("cities", "0005_cityserviceconfig_cityservicearea_cityprofile_and_more"),
    ]

    operations = [
        migrations.RunPython(register_expansion_cities, restore_previous_french),
    ]


