"""Delivery Administration city scoping (Task 8) — prepared, DISABLED by default.

Mode comes from ``settings.DELIVERY_CITY_SCOPING`` (not set anywhere yet, so it is "off"):

* ``"off"``     — no effect at all; every caller gets exactly today's behaviour.
* ``"shadow"``  — no effect on responses; logs what enforcement WOULD hide or deny.
* ``"enforce"`` — national roles see everything; city staff see only their assigned cities;
                  staff without an active assignment are denied (403). Never falls back to
                  national access because an assignment is missing.

Scope sources (explicit only): CEO / Super Admin / superuser = national; everyone else =
active ``StaffCityAssignment`` rows. ``User.city`` is deliberately NOT used.

Delivery -> city mapping (deterministic, no silent merging):
  stored ``Delivery.service_city`` text must EQUAL a canonical delivery city name
  (deliveries/cities.py) that maps to exactly one ``locations.City`` whose name normalises to
  the same canonical name. Anything else is "unmapped" and visible to national users only.
  Delivery records are never modified.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from .cities import normalize_city_name

logger = logging.getLogger("yala.city_scope")
VALID_MODES = ("off", "shadow", "enforce")
DENIED_BODY = {"detail": "City access denied.", "code": "city_access_denied"}


def scoping_mode() -> str:
    mode = str(getattr(settings, "DELIVERY_CITY_SCOPING", "off") or "off").lower()
    return mode if mode in VALID_MODES else "off"


@dataclass(frozen=True)
class DeliveryScope:
    national: bool
    city_ids: frozenset = field(default_factory=frozenset)
    city_names: frozenset = field(default_factory=frozenset)  # canonical service_city values
    roles: frozenset = field(default_factory=frozenset)

    @property
    def has_access(self) -> bool:
        return self.national or bool(self.city_ids)


def delivery_city_map() -> dict[str, int]:
    """Canonical delivery city name -> ``locations.City`` id (YALA operating metros only)."""
    from locations.operating_cities import build_operating_city_payload

    mapped: dict[str, int] = {}
    for row in build_operating_city_payload():
        canon = normalize_city_name(row.get("name") or "") or normalize_city_name(
            row.get("canonical_name") or ""
        )
        if canon and canon not in mapped:
            mapped[canon] = row["id"]
    return mapped


def get_delivery_scope(user) -> DeliveryScope:
    from operations.city_assignment_models import StaffCityAssignment
    from operations.multi_city_permissions import has_national_access

    if not user or not user.is_authenticated:
        return DeliveryScope(national=False)
    if has_national_access(user):
        return DeliveryScope(national=True)
    rows = list(
        StaffCityAssignment.objects.filter(user=user, is_active=True).values_list("city_id", "role")
    )
    city_ids = frozenset(city_id for city_id, _ in rows)
    by_id = {city_id: name for name, city_id in delivery_city_map().items()}
    names = frozenset(by_id[city_id] for city_id in city_ids if city_id in by_id)
    return DeliveryScope(national=False, city_ids=city_ids, city_names=names,
                         roles=frozenset(role for _, role in rows))


def filter_deliveries(qs, scope: DeliveryScope):
    return qs if scope.national else qs.filter(service_city__in=sorted(scope.city_names))


def delivery_in_scope(delivery, scope: DeliveryScope) -> bool:
    return scope.national or delivery.service_city in scope.city_names


def filter_courier_settings(settings_qs, scope: DeliveryScope):
    """Couriers serving at least one in-scope city (by normalised delivery_cities)."""
    if scope.national:
        return settings_qs
    keep = [
        row_id
        for row_id, cities in settings_qs.values_list("id", "delivery_cities")
        if {normalize_city_name(c) for c in (cities or [])} & scope.city_names
    ]
    return settings_qs.filter(id__in=keep)


def scope_queryset(request, qs, endpoint: str):
    """Returns (queryset, denied_response_or_None) for list endpoints."""
    mode = scoping_mode()
    if mode == "off":
        return qs, None
    scope = get_delivery_scope(request.user)
    if mode == "shadow":
        if not scope.has_access:
            logger.warning("city_scope_shadow endpoint=%s user=%s would_deny=1", endpoint, request.user.pk)
        elif not scope.national:
            hidden = qs.count() - filter_deliveries(qs, scope).count()
            if hidden:
                logger.warning("city_scope_shadow endpoint=%s user=%s would_hide=%d", endpoint, request.user.pk, hidden)
        return qs, None
    if not scope.has_access:
        return qs.none(), Response(DENIED_BODY, status=status.HTTP_403_FORBIDDEN)
    return filter_deliveries(qs, scope), None


def check_delivery(request, delivery, endpoint: str):
    """Returns a 403 Response when the delivery is outside the caller's scope (enforce mode)."""
    mode = scoping_mode()
    if mode == "off":
        return None
    scope = get_delivery_scope(request.user)
    allowed = scope.has_access and delivery_in_scope(delivery, scope)
    if mode == "shadow":
        if not allowed:
            logger.warning("city_scope_shadow endpoint=%s user=%s delivery=%s would_deny=1",
                           endpoint, request.user.pk, delivery.pk)
        return None
    return None if allowed else Response(DENIED_BODY, status=status.HTTP_403_FORBIDDEN)
