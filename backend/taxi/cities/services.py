"""Dynamic City Management service layer.

Design rules enforced here:

* ``cities.City`` is the single canonical service-city registry — no second city
  model is created anywhere.
* Adding a city is **idempotent**: ``ensure_city`` matches an existing row
  (accent-, case- and punctuation-insensitively) before it ever creates one, so
  running it twice cannot duplicate a city.
* A newly registered city is never live: ``is_live=False`` and every
  ``CityServiceConfig`` row starts ``is_active=False``.
* Existing records are never deleted and existing identifiers are never
  rewritten; metadata is only filled in where it is missing unless the caller
  explicitly asks to refresh it.
* Every administrative change is written to the existing
  ``app_settings.PricingAuditLog`` trail (reused rather than duplicated).
"""

from __future__ import annotations

import logging
import unicodedata
from decimal import Decimal

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .models import (
    SERVICE_CATALOG,
    SERVICE_DELIVERY,
    SERVICE_DRIVER,
    SERVICE_LABELS,
    SERVICE_RIDER,
    City,
    CityPricingProfile,
    CityProfile,
    CityServiceArea,
    CityServiceConfig,
    Region,
    service_categories,
)

logger = logging.getLogger(__name__)

DEFAULT_COUNTRY = "Mauritania"
DEFAULT_ISO_COUNTRY_CODE = "MR"
DEFAULT_TIMEZONE = "Africa/Nouakchott"

#: The migration that introduces the City Management tables. Until it is
#: applied the platform stays fully functional: the registry, activation and
#: audit endpoints work, and the newer layers report "migration required".
CITY_MANAGEMENT_MIGRATION = "cities.0005_city_management"

AUDIT_MODEL_NAME = "cities.City"

ACTION_CREATE = "create"
ACTION_UPDATE = "update"
ACTION_ACTIVATE = "activate"
ACTION_DEACTIVATE = "deactivate"


class ServiceUnavailable(Exception):
    """Raised when a service is requested in a city where it is not active."""


#: Known spelling variants mapped to the registry's canonical key. Mirrors the
#: existing alias approach in ``deliveries/cities.py`` so a Founder/CEO-entered
#: spelling can never create a duplicate city row.
#: e.g. the directive spells "Zouérat" while the registry holds "Zouerate".
CITY_NAME_ALIASES = {
    "zouerat": "zouerate",
    "zoueratt": "zouerate",
    "zouirate": "zouerate",
    "selibabi": "selibaby",
    "aioun": "aioun el atrouss",
    "ouad naga": "wad naga",
    "keur macene": "keur macene",
    "fderik": "f derik",
    "mbout": "m bout",
    "mbagne": "m bagne",
    "rkiz": "r kiz",
    "nbeika": "n beika",
}


def normalize_name(value):
    """Accent-, case- and punctuation-insensitive comparison key.

    ``"Kaédi"``, ``"KAEDI"`` and ``"kaedi"`` all collapse to ``"kaedi"``, and
    known spelling variants (such as ``"Zouérat"`` for the registry's
    ``"Zouerate"``) are folded onto the canonical key so an operator spelling a
    city differently can never create a duplicate.
    """
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = "".join(ch if ch.isalnum() else " " for ch in stripped.casefold())
    key = " ".join(cleaned.split())
    return CITY_NAME_ALIASES.get(key, key)


def city_management_ready():
    """True when the City Management tables exist in the local database.

    Checked against the real database schema (not the model classes) so the
    platform stays correct while ``cities.0005_city_management`` is awaiting
    CEO authorization.
    """
    global _READY_CACHE
    if _READY_CACHE is not None:
        return _READY_CACHE
    try:
        from django.db import connection

        tables = set(connection.introspection.table_names())
    except Exception:  # pragma: no cover - no database available
        return False
    required = (
        CityProfile._meta.db_table,
        CityServiceConfig._meta.db_table,
        CityPricingProfile._meta.db_table,
        CityServiceArea._meta.db_table,
    )
    _READY_CACHE = all(table in tables for table in required)
    return _READY_CACHE


_READY_CACHE = None


def get_city_profile(city, *, create=False):
    """Return the additive ``CityProfile`` row, or ``None`` if not available."""
    if not city_management_ready():
        return None
    profile = CityProfile.objects.filter(city=city).first()
    if profile is None and create:
        profile = CityProfile.objects.create(city=city)
    return profile


def audit(actor, action, city=None, *, field_name="", old_value="", new_value="", reason=""):
    """Write an administrative change to the existing pricing audit trail.

    Best-effort by design: an audit failure must never roll back the
    administrative action the Founder/CEO actually requested.
    """
    try:
        from app_settings.models import PricingAuditLog

        PricingAuditLog.objects.create(
            user=actor if getattr(actor, "pk", None) else None,
            action=action,
            model_name=AUDIT_MODEL_NAME,
            object_id=str(getattr(city, "pk", "") or ""),
            object_repr=str(city)[:255] if city is not None else "",
            field_name=field_name[:80],
            old_value=str(old_value)[:2000],
            new_value=str(new_value)[:2000],
            reason=str(reason)[:255],
        )
    except Exception:  # pragma: no cover - audit must never break the action
        logger.exception("City audit entry could not be written")


def find_city(name=None, *, region_name=None, city_id=None):
    """Locate an existing city without ever creating one.

    Returns ``(city, matches)`` where ``matches`` is the full list of rows that
    answer to the same name — a non-empty ``matches[1:]`` means the legacy data
    contains a duplicate that needs CEO review, not silent deletion.
    """
    if city_id:
        city = City.objects.filter(pk=city_id).select_related("region").first()
        return city, ([city] if city else [])

    key = normalize_name(name)
    if not key:
        return None, []

    candidates = City.objects.select_related("region")
    if region_name:
        candidates = candidates.filter(region__name__iexact=str(region_name).strip())

    matches = [c for c in candidates if normalize_name(c.name) == key]
    if not matches and region_name:
        # Same city filed under a legacy/duplicate region (e.g. the "Atar"
        # region created by an earlier data migration alongside "Adrar").
        matches = [
            c
            for c in City.objects.select_related("region")
            if normalize_name(c.name) == key
        ]
    if not matches:
        return None, []

    matches.sort(key=lambda c: (not c.is_active, c.pk))
    return matches[0], matches


def profile_ready():
    """True when the additive city metadata table is available."""
    return city_management_ready()


def ensure_region(name, *, name_fr="", name_ar=""):
    """Get or create a region/wilaya by name."""
    region, created = Region.objects.get_or_create(
        name=str(name).strip(),
        defaults={
            "name_fr": name_fr or str(name).strip(),
            "name_ar": name_ar or "",
            "is_active": True,
        },
    )
    if not created:
        changed = []
        if name_fr and not region.name_fr:
            region.name_fr = name_fr
            changed.append("name_fr")
        if name_ar and not region.name_ar:
            region.name_ar = name_ar
            changed.append("name_ar")
        if changed:
            region.save(update_fields=changed)
    return region, created


def ensure_city(
    *,
    name,
    region_name,
    name_fr="",
    name_ar="",
    latitude=None,
    longitude=None,
    country=DEFAULT_COUNTRY,
    iso_country_code=DEFAULT_ISO_COUNTRY_CODE,
    timezone_name=DEFAULT_TIMEZONE,
    code="",
    actor=None,
    refresh_names=False,
    reason="",
):
    """Idempotently register a city. Returns ``(city, created)``.

    Running this repeatedly never creates a duplicate and never rewrites an
    existing identifier or region link. By default only blank metadata is
    filled in; pass ``refresh_names=True`` to overwrite names deliberately.
    """
    existing, matches = find_city(name, region_name=region_name)

    profile = get_city_profile(existing, create=True) if existing is not None else None

    if existing is not None:
        updated = []
        for field, value in (("name_fr", name_fr), ("name_ar", name_ar)):
            if not value:
                continue
            if refresh_names or not getattr(existing, field):
                if getattr(existing, field) != value:
                    setattr(existing, field, value)
                    updated.append(field)

        if latitude is not None and (refresh_names or not existing.latitude):
            existing.latitude = latitude
            updated.append("latitude")
        if longitude is not None and (refresh_names or not existing.longitude):
            existing.longitude = longitude
            updated.append("longitude")

        if profile is not None:
            profile_updates = []
            for field, value in (
                ("country", country),
                ("iso_country_code", iso_country_code),
                ("timezone", timezone_name),
                ("code", code),
            ):
                if not value:
                    continue
                if refresh_names or not getattr(profile, field, ""):
                    if getattr(profile, field, "") != value:
                        setattr(profile, field, value)
                        profile_updates.append(field)
            if profile_updates:
                profile.save(update_fields=sorted(set(profile_updates)) + ["updated_at"])
                updated.extend(profile_updates)

        updated = sorted(set(updated))
        if updated:
            existing.save(update_fields=updated)
            audit(
                actor,
                ACTION_UPDATE,
                existing,
                field_name=",".join(updated),
                new_value=str({f: getattr(existing, f) for f in updated}),
                reason=reason or "City metadata filled in during registration",
            )

        if len(matches) > 1:
            audit(
                actor,
                ACTION_UPDATE,
                existing,
                field_name="duplicate_review",
                new_value=", ".join(
                    f"#{m.pk} {m.name} ({m.region.name})" for m in matches[1:]
                ),
                reason="Duplicate city rows detected — CEO review required, nothing deleted",
            )
        return existing, False

    region, _ = ensure_region(region_name)
    payload = {
        "name": str(name).strip(),
        "name_fr": name_fr or str(name).strip(),
        "name_ar": name_ar or "",
        "latitude": latitude if latitude is not None else 0,
        "longitude": longitude if longitude is not None else 0,
        "is_active": True,
    }
    city = City.objects.create(region=region, **payload)
    new_profile = get_city_profile(city, create=True)
    if new_profile is not None:
        fields_to_set = []
        for field, value in (
            ("country", country),
            ("iso_country_code", iso_country_code),
            ("timezone", timezone_name),
            ("code", code),
        ):
            if value:
                setattr(new_profile, field, value)
                fields_to_set.append(field)
        if fields_to_set:
            new_profile.save(update_fields=sorted(set(fields_to_set)) + ["updated_at"])
    return city, True
    audit(
        actor,
        ACTION_CREATE,
        city,
        new_value=f"{city.name} ({region.name})",
        reason=reason or "City registered",
    )
    return city, True


def ensure_service_catalog(city, *, actor=None):
    """Create every service/category row for a city, all inactive.

    Returns the number of rows created. Safe to call repeatedly.
    """
    if not city_management_ready():
        return 0
    created = 0
    for service, categories in SERVICE_CATALOG.items():
        for category, _label in categories:
            _row, was_created = CityServiceConfig.objects.get_or_create(
                city=city,
                service=service,
                category=category,
                defaults={"is_active": False},
            )
            if was_created:
                created += 1
    if created:
        audit(
            actor,
            ACTION_UPDATE,
            city,
            field_name="service_catalog",
            new_value=f"{created} service rows created (all inactive)",
            reason="Service catalog initialised — nothing activated",
        )
    return created


def services_for_city(city):
    """Full service matrix for a city, including rows that do not exist yet."""
    if not city_management_ready():
        return {
            "ready": False,
            "requires_migration": CITY_MANAGEMENT_MIGRATION,
            "services": {},
        }
    existing = {
        (row.service, row.category): row
        for row in CityServiceConfig.objects.filter(city=city)
    }
    services = {}
    for service, categories in SERVICE_CATALOG.items():
        rows = []
        for category, label in categories:
            row = existing.get((service, category))
            rows.append(
                {
                    "category": category,
                    "label": label,
                    "is_active": bool(row and row.is_active),
                    "activated_at": row.activated_at if row else None,
                    "activated_by": (
                        row.activated_by.get_username()
                        if row and row.activated_by_id
                        else ""
                    ),
                    "notes": row.notes if row else "",
                    "exists": row is not None,
                }
            )
        services[service] = {
            "label": SERVICE_LABELS[service],
            "categories": rows,
            "any_active": any(r["is_active"] for r in rows),
        }
    return {"ready": True, "requires_migration": "", "services": services}


def set_city_active(city, is_active, *, actor=None, reason=""):
    """Activate or deactivate a city in the registry (audited)."""
    previous = city.is_active
    if previous == bool(is_active):
        return city, False
    city.is_active = bool(is_active)
    city.save(update_fields=["is_active"])
    audit(
        actor,
        ACTION_ACTIVATE if is_active else ACTION_DEACTIVATE,
        city,
        field_name="is_active",
        old_value=previous,
        new_value=city.is_active,
        reason=reason or ("City activated" if is_active else "City deactivated"),
    )
    return city, True


def set_city_live(city, is_live, *, actor=None, reason=""):
    """Open or close live operations for a city. CEO authorization required.

    Live operations additionally require at least one active service, so a city
    can never go live with nothing switched on.
    """
    profile = get_city_profile(city, create=True)
    if profile is None:
        raise ServiceUnavailable(
            f"Live-operations gating requires migration {CITY_MANAGEMENT_MIGRATION}."
        )
    if is_live:
        matrix = services_for_city(city)
        if not matrix.get("ready") or not any(
            entry["any_active"] for entry in matrix["services"].values()
        ):
            raise ServiceUnavailable(
                "A city cannot go live before at least one service is activated."
            )
    previous = profile.is_live
    if previous == bool(is_live):
        return city, False
    profile.is_live = bool(is_live)
    profile.save(update_fields=["is_live", "updated_at"])
    audit(
        actor,
        ACTION_ACTIVATE if is_live else ACTION_DEACTIVATE,
        city,
        field_name="is_live",
        old_value=previous,
        new_value=profile.is_live,
        reason=reason or ("Live operations opened" if is_live else "Live operations closed"),
    )
    return city, True


def set_service_active(city, service, category, is_active, *, actor=None, reason=""):
    """Activate/deactivate one service category for one city (audited)."""
    if service not in SERVICE_CATALOG:
        raise ValueError(f"Unknown service: {service}")
    if category not in service_categories(service):
        raise ValueError(f"Unknown category {category!r} for service {service!r}")
    if not city_management_ready():
        raise ServiceUnavailable(
            f"Service activation requires migration {CITY_MANAGEMENT_MIGRATION}."
        )
    row, _created = CityServiceConfig.objects.get_or_create(
        city=city,
        service=service,
        category=category,
        defaults={"is_active": False},
    )
    if row.is_active == bool(is_active):
        return row, False
    row.is_active = bool(is_active)
    row.activated_at = timezone.now() if is_active else None
    row.activated_by = actor if (is_active and getattr(actor, "pk", None)) else None
    if reason:
        row.notes = reason
    row.save(
        update_fields=["is_active", "activated_at", "activated_by", "notes", "updated_at"]
    )
    audit(
        actor,
        ACTION_ACTIVATE if is_active else ACTION_DEACTIVATE,
        city,
        field_name=f"{service}.{category}",
        old_value=not is_active,
        new_value=bool(is_active),
        reason=reason
        or (
            f"{SERVICE_LABELS[service]} · {category} "
            f"{'activated' if is_active else 'deactivated'}"
        ),
    )
    return row, True


def service_available(city, service, category=None):
    """True when a service (or a specific category) is live in this city."""
    if city is None or not getattr(city, "is_active", False):
        return False
    if not city_management_ready():
        return False
    profile = get_city_profile(city)
    if profile is not None and not profile.is_live:
        return False
    rows = CityServiceConfig.objects.filter(city=city, service=service, is_active=True)
    if category:
        return rows.filter(category=category).exists()
    return rows.exists()


def assert_service_available(city, service, category=None):
    """Raise ``ServiceUnavailable`` unless the service is live in this city."""
    if service_available(city, service, category):
        return True
    label = SERVICE_LABELS.get(service, service)
    raise ServiceUnavailable(
        f"{label} is not available in {getattr(city, 'name', 'this city')} yet."
    )


def _ride_queryset(city):
    """Rides attributed to a canonical service city.

    ``Ride.city`` points at the parallel ``locations.City`` hierarchy, while
    drivers and riders point at ``cities.City``. Both are matched here in one
    queryset so a ride is counted once, never twice.
    """
    from taxi.rides.models import Ride

    name_q = Q(city__name__iexact=city.name)
    if getattr(city, "name_fr", ""):
        name_q |= Q(city__name__iexact=city.name_fr)
    return Ride.objects.filter(name_q | Q(rider__city=city))


def _delivery_queryset(city):
    """Deliveries attributed to a canonical service city.

    ``Delivery.service_city`` is a plain character field today, so the match is
    made on the canonical name and its French spelling.
    """
    from deliveries.models import Delivery

    name_q = Q(service_city__iexact=city.name)
    if getattr(city, "name_fr", ""):
        name_q |= Q(service_city__iexact=city.name_fr)
    return Delivery.objects.filter(name_q)


def city_performance(city):
    """Verified city-level operations figures for the CEO dashboard.

    Rules honoured: couriers are excluded from driver counts (no double
    counting), only completed/settled activity contributes money, and wallet
    liabilities are never treated as revenue.
    """
    User = get_user_model()
    from deliveries.models import DriverDeliverySettings
    from taxi.drivers.models import DriverProfile

    driver_users = User.objects.filter(city=city, user_type="driver")
    courier_ids = set(
        DriverDeliverySettings.objects.filter(driver__city=city).values_list(
            "driver_id", flat=True
        )
    )
    ride_driver_users = driver_users.exclude(pk__in=courier_ids)

    rides = _ride_queryset(city)
    completed_rides = rides.filter(status="completed")
    deliveries = _delivery_queryset(city)
    delivered = deliveries.filter(status="delivered")

    ride_money = completed_rides.aggregate(fare=Sum("fare"), fee=Sum("app_fee"))
    delivery_money = delivered.aggregate(fare=Sum("fare"))

    return {
        "city_id": city.pk,
        "city_name": city.name,
        "region": city.region.name,
        "is_active": city.is_active,
        "is_live": bool(getattr(get_city_profile(city), "is_live", False)),
        "total_drivers": ride_driver_users.count(),
        "approved_drivers": DriverProfile.objects.filter(
            user__in=ride_driver_users, status="approved"
        ).count(),
        "active_drivers": DriverProfile.objects.filter(
            user__in=ride_driver_users, status="approved", is_available=True
        ).count(),
        "total_couriers": len(courier_ids),
        "active_couriers": DriverProfile.objects.filter(
            user_id__in=courier_ids, is_available=True
        ).count(),
        "total_riders": User.objects.filter(city=city, user_type="rider").count(),
        "completed_rides": completed_rides.count(),
        "cancelled_rides": rides.filter(status="cancelled").count(),
        "completed_deliveries": delivered.count(),
        "cancelled_deliveries": deliveries.filter(status="cancelled").count(),
        "gross_transaction_value": float(
            (ride_money["fare"] or Decimal("0")) + (delivery_money["fare"] or Decimal("0"))
        ),
        "platform_revenue": float(ride_money["fee"] or Decimal("0")),
        "operational_status": operational_status(city),
    }


def operational_status(city):
    """Human operational status derived from real flags, never assumed."""
    if not city.is_active:
        return "inactive"
    matrix = services_for_city(city)
    if not matrix.get("ready"):
        return "registered"
    profile = get_city_profile(city)
    if profile is not None and not profile.is_live:
        return "registered"
    if any(entry["any_active"] for entry in matrix["services"].values()):
        return "live"
    return "registered"


def serialize_city(city, *, include_services=False, include_performance=False):
    """Consistent city payload for the City Management dashboard."""
    profile = get_city_profile(city)
    payload = {
        "id": city.pk,
        "name": city.name,
        "name_fr": city.name_fr,
        "name_ar": city.name_ar,
        "region": city.region.name,
        "region_id": city.region_id,
        "country": getattr(profile, "country", DEFAULT_COUNTRY) or DEFAULT_COUNTRY,
        "iso_country_code": (
            getattr(profile, "iso_country_code", DEFAULT_ISO_COUNTRY_CODE)
            or DEFAULT_ISO_COUNTRY_CODE
        ),
        "timezone": getattr(profile, "timezone", DEFAULT_TIMEZONE) or DEFAULT_TIMEZONE,
        "code": getattr(profile, "code", "") or "",
        "latitude": city.latitude,
        "longitude": city.longitude,
        "is_active": city.is_active,
        "is_live": bool(getattr(profile, "is_live", False)),
        "operational_status": operational_status(city),
        "created_at": city.created_at,
        "updated_at": getattr(profile, "updated_at", None) or city.created_at,
        "base_price_regular": (
            float(city.base_price_regular) if city.base_price_regular else None
        ),
        "per_km_regular": float(city.per_km_regular) if city.per_km_regular else None,
    }
    if include_services:
        payload["services"] = services_for_city(city)
    if include_performance:
        payload["performance"] = city_performance(city)
    return payload


def list_cities(*, search="", region="", status="", limit=None):
    """Search/filter the registry for the City Management dashboard."""
    queryset = City.objects.select_related("region")
    search = (search or "").strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(name_fr__icontains=search)
            | Q(name_ar__icontains=search)
            | Q(region__name__icontains=search)
        )
    region = (region or "").strip()
    if region:
        queryset = queryset.filter(region__name__iexact=region)
    status = (status or "").strip().lower()
    if status == "active":
        queryset = queryset.filter(is_active=True)
    elif status == "inactive":
        queryset = queryset.filter(is_active=False)
    elif status in {"live", "registered"} and city_management_ready():
        live_ids = set(
            CityProfile.objects.filter(is_live=True).values_list("city_id", flat=True)
        )
        queryset = (
            queryset.filter(pk__in=live_ids)
            if status == "live"
            else queryset.exclude(pk__in=live_ids)
        )

    rows = list(queryset.order_by("region__name", "name"))
    if limit:
        rows = rows[: int(limit)]
    return [serialize_city(city) for city in rows]


def duplicate_city_groups():
    """Legacy duplicate city rows grouped by normalised name (review only)."""
    groups = {}
    for city in City.objects.select_related("region"):
        groups.setdefault(normalize_name(city.name), []).append(city)
    return {
        key: [serialize_city(city) for city in cities]
        for key, cities in groups.items()
        if key and len(cities) > 1
    }


def people_by_city(city):
    """Drivers and couriers operating in a city (no overlap, no double count)."""
    User = get_user_model()
    from deliveries.models import DriverDeliverySettings
    from taxi.drivers.models import DriverProfile

    driver_users = User.objects.filter(city=city, user_type="driver")
    courier_ids = set(
        DriverDeliverySettings.objects.filter(driver__city=city).values_list(
            "driver_id", flat=True
        )
    )
    profiles = {
        profile.user_id: profile
        for profile in DriverProfile.objects.filter(user__in=driver_users)
    }

    def entry(user):
        profile = profiles.get(user.pk)
        return {
            "id": user.pk,
            "name": user.get_full_name() or user.get_username(),
            "email": user.email,
            "phone": getattr(user, "phone_number", "") or "",
            "status": profile.status if profile else "",
            "is_available": bool(profile.is_available) if profile else False,
            "is_courier": user.pk in courier_ids,
        }

    drivers = [entry(u) for u in driver_users if u.pk not in courier_ids]
    couriers = [entry(u) for u in driver_users if u.pk in courier_ids]
    return {
        "city_id": city.pk,
        "city_name": city.name,
        "drivers": drivers,
        "couriers": couriers,
        "total_drivers": len(drivers),
        "total_couriers": len(couriers),
    }


def coverage_check(city, latitude, longitude):
    """Is a coordinate inside a configured service area for this city?

    ``inside`` is ``None`` when no boundary is configured — coverage is never
    assumed to be uniform across cities.
    """
    if not city_management_ready():
        return {
            "configured": False,
            "inside": None,
            "requires_migration": CITY_MANAGEMENT_MIGRATION,
            "message": "Service areas require migration "
            f"{CITY_MANAGEMENT_MIGRATION} to be applied.",
        }
    areas = list(CityServiceArea.objects.filter(city=city, is_active=True))
    if not areas:
        return {
            "configured": False,
            "inside": None,
            "requires_migration": "",
            "message": f"No service area is configured for {city.name} yet.",
        }
    matched = [area.name for area in areas if area.contains(latitude, longitude)]
    return {
        "configured": True,
        "inside": bool(matched),
        "requires_migration": "",
        "matched_areas": matched,
        "message": (
            f"Inside {city.name} service area ({', '.join(matched)})."
            if matched
            else f"Outside the configured {city.name} service area."
        ),
    }


PRICING_FIELDS = (
    "currency",
    "base_fare",
    "per_km",
    "per_minute",
    "minimum_fare",
    "waiting_per_minute",
    "service_fee",
    "shared_base_fare",
    "shared_per_km",
    "shared_discount_percent",
    "delivery_base_fare",
    "delivery_per_km",
    "delivery_minimum_fare",
    "surge_multiplier",
    "notes",
)


def get_pricing(city):
    """Current pricing profile for a city, or a clear not-configured state."""
    if not city_management_ready():
        return {
            "configured": False,
            "is_active": False,
            "requires_migration": CITY_MANAGEMENT_MIGRATION,
            "values": {},
        }
    profile = CityPricingProfile.objects.filter(city=city).first()
    if profile is None:
        return {"configured": False, "is_active": False, "requires_migration": "", "values": {}}
    return {
        "configured": True,
        "is_active": profile.is_active,
        "requires_migration": "",
        "approved_at": profile.approved_at,
        "values": {
            field: (
                str(getattr(profile, field))
                if field != "currency"
                else getattr(profile, field)
            )
            for field in PRICING_FIELDS
        },
    }


def update_pricing(city, values, *, actor=None, reason="", activate=False):
    """Update city pricing. Never copies another city's pricing, never
    activates it unless ``activate=True`` is passed by an authorized caller.
    """
    if not city_management_ready():
        raise ServiceUnavailable(
            f"City pricing requires migration {CITY_MANAGEMENT_MIGRATION}."
        )
    profile, created = CityPricingProfile.objects.get_or_create(city=city)
    changed = {}
    for field in PRICING_FIELDS:
        if field not in values or values[field] in (None, ""):
            continue
        new_value = values[field]
        if field != "currency":
            new_value = Decimal(str(new_value))
        old_value = getattr(profile, field)
        if old_value == new_value:
            continue
        changed[field] = (old_value, new_value)
        setattr(profile, field, new_value)

    if changed:
        profile.full_clean(exclude=["city", "approved_by", "approved_at"])
        profile.save()
        for field, (old, new) in changed.items():
            audit(
                actor,
                ACTION_UPDATE,
                city,
                field_name=f"pricing.{field}",
                old_value=old,
                new_value=new,
                reason=reason or "City pricing updated",
            )

    if activate and not profile.is_active:
        profile.is_active = True
        profile.approved_by = actor if getattr(actor, "pk", None) else None
        profile.approved_at = timezone.now()
        profile.save(update_fields=["is_active", "approved_by", "approved_at", "updated_at"])
        audit(
            actor,
            ACTION_ACTIVATE,
            city,
            field_name="pricing.is_active",
            old_value=False,
            new_value=True,
            reason=reason or "City pricing activated (CEO authorization)",
        )

    return profile, created, changed







