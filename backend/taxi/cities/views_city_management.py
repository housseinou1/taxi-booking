"""Dynamic City Management API for the CEO Command Center.

Access model (role-based, reusing the platform's existing group vocabulary):

* ``IsCityViewer``  — CEO, Super Admin and executive/operations roles: read the
  registry, services, pricing, performance, people and audit trail.
* ``IsCityManager`` — CEO, Super Admin and authorized administrators: add and
  edit cities, activate/deactivate cities and services, configure pricing
  values and operational boundaries.
* ``IsCityCeo``     — Founder/CEO only: open live operations and activate live
  pricing. No new city or service ever starts live without this.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from operations.executive_permissions import (
    EXECUTIVE_GROUPS,
    can_view_executive,
    user_in_groups,
)

from .models import SERVICE_CATALOG, SERVICE_LABELS, City, CityServiceArea, Region
from .services import (
    CITY_MANAGEMENT_MIGRATION,
    ServiceUnavailable,
    city_management_ready,
    city_performance,
    coverage_check,
    duplicate_city_groups,
    ensure_city,
    ensure_service_catalog,
    get_pricing,
    list_cities,
    people_by_city,
    serialize_city,
    services_for_city,
    set_city_active,
    set_city_live,
    set_service_active,
    update_pricing,
)

CITY_MANAGER_GROUPS = {"CEO", "Super Admin", "Operations Manager"}


def can_view_cities(user):
    return can_view_executive(user) or user_in_groups(user, EXECUTIVE_GROUPS)


def can_manage_cities(user):
    return user_in_groups(user, CITY_MANAGER_GROUPS)


def can_ceo_city_actions(user):
    return user_in_groups(user, {"CEO", "Super Admin"})


class IsCityViewer(BasePermission):
    def has_permission(self, request, view):
        return can_view_cities(request.user)


class IsCityManager(BasePermission):
    def has_permission(self, request, view):
        return can_manage_cities(request.user)


class IsCityCeo(BasePermission):
    def has_permission(self, request, view):
        return can_ceo_city_actions(request.user)


class CityManagementBaseView(APIView):
    permission_classes = [IsCityViewer]

    def capabilities(self, request):
        return {
            "can_view": can_view_cities(request.user),
            "can_manage": can_manage_cities(request.user),
            "can_ceo_actions": can_ceo_city_actions(request.user),
            "city_management_ready": city_management_ready(),
            "requires_migration": (
                "" if city_management_ready() else CITY_MANAGEMENT_MIGRATION
            ),
            "service_catalog": {
                service: [{"category": code, "label": label} for code, label in rows]
                for service, rows in SERVICE_CATALOG.items()
            },
            "service_labels": SERVICE_LABELS,
        }

    def get_city(self, city_id):
        return City.objects.select_related("region").filter(pk=city_id).first()


class CityManagementListView(CityManagementBaseView):
    """GET — registry with search/region/status filters. POST — add a city."""

    def get(self, request):
        return Response(
            {
                "cities": list_cities(
                    search=request.query_params.get("search", ""),
                    region=request.query_params.get("region", ""),
                    status=request.query_params.get("status", ""),
                ),
                "regions": list(
                    Region.objects.order_by("name").values("id", "name", "name_fr", "name_ar")
                ),
                "count": City.objects.count(),
                "capabilities": self.capabilities(request),
            }
        )

    def post(self, request):
        if not can_manage_cities(request.user):
            return Response(
                {"detail": "You are not authorized to add cities."},
                status=status.HTTP_403_FORBIDDEN,
            )
        name = (request.data.get("name") or "").strip()
        region_name = (request.data.get("region") or "").strip()
        if not name or not region_name:
            return Response(
                {"detail": "A city name and a region/wilaya are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        city, created = ensure_city(
            name=name,
            region_name=region_name,
            name_fr=request.data.get("name_fr", ""),
            name_ar=request.data.get("name_ar", ""),
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
            code=request.data.get("code", ""),
            actor=request.user,
            reason="City added from the CEO Command Center",
        )
        ensure_service_catalog(city, actor=request.user)
        return Response(
            {
                "city": serialize_city(city, include_services=True),
                "created": created,
                "message": (
                    f"{city.name} registered. No service is live yet — activate "
                    "services and open live operations to begin operations."
                ),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CityDetailView(CityManagementBaseView):
    """GET — full city detail. PATCH — edit city information."""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "city": serialize_city(city, include_services=True, include_performance=True),
                "pricing": get_pricing(city),
                "service_areas": [
                    {
                        "id": area.pk,
                        "name": area.name,
                        "center_latitude": area.center_latitude,
                        "center_longitude": area.center_longitude,
                        "radius_km": area.radius_km,
                        "polygon": area.polygon,
                        "is_active": area.is_active,
                    }
                    for area in CityServiceArea.objects.filter(city=city)
                ]
                if city_management_ready()
                else [],
                "capabilities": self.capabilities(request),
            }
        )

    def patch(self, request, city_id):
        if not can_manage_cities(request.user):
            return Response(
                {"detail": "You are not authorized to edit cities."},
                status=status.HTTP_403_FORBIDDEN,
            )
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)

        editable = {"name", "name_fr", "name_ar", "latitude", "longitude"}
        updates = {}
        for field in editable:
            if field in request.data and request.data[field] not in (None, ""):
                updates[field] = request.data[field]
        if not updates:
            return Response(
                {"detail": "No editable field was provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import ACTION_UPDATE, audit

        previous = {field: getattr(city, field) for field in updates}
        for field, value in updates.items():
            setattr(city, field, value)
        city.save(update_fields=sorted(updates))
        for field, value in updates.items():
            audit(
                request.user,
                ACTION_UPDATE,
                city,
                field_name=field,
                old_value=previous[field],
                new_value=value,
                reason=request.data.get("reason", "City information edited"),
            )
        return Response(
            {
                "city": serialize_city(city, include_services=True),
                "updated": sorted(updates),
            }
        )


class CityActivationView(CityManagementBaseView):
    """POST — activate or deactivate a city in the registry."""

    permission_classes = [IsCityManager]
    action = "activate"

    def post(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        is_active = self.action == "activate"
        city, changed = set_city_active(
            city,
            is_active,
            actor=request.user,
            reason=request.data.get("reason", ""),
        )
        return Response(
            {
                "city": serialize_city(city, include_services=True),
                "changed": changed,
                "message": (
                    f"{city.name} {'activated' if is_active else 'deactivated'}."
                    + (
                        ""
                        if is_active
                        else " Existing bookings and records are preserved."
                    )
                ),
            }
        )


class CityDeactivationView(CityActivationView):
    action = "deactivate"


class CityLiveView(CityManagementBaseView):
    """POST — open or close live operations for a city (Founder/CEO only)."""

    permission_classes = [IsCityCeo]

    def post(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        is_live = bool(request.data.get("is_live", False))
        try:
            city, changed = set_city_live(
                city,
                is_live,
                actor=request.user,
                reason=request.data.get("reason", ""),
            )
        except ServiceUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(
            {
                "city": serialize_city(city, include_services=True),
                "changed": changed,
                "message": (
                    f"Live operations {'opened' if is_live else 'closed'} for {city.name}."
                ),
            }
        )


class CityServicesView(CityManagementBaseView):
    """GET — service matrix. POST — activate/deactivate one service category."""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "city_id": city.pk,
                "city_name": city.name,
                "matrix": services_for_city(city),
                "capabilities": self.capabilities(request),
            }
        )

    def post(self, request, city_id):
        if not can_manage_cities(request.user):
            return Response(
                {"detail": "You are not authorized to change city services."},
                status=status.HTTP_403_FORBIDDEN,
            )
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)

        service = (request.data.get("service") or "").strip()
        category = (request.data.get("category") or "").strip()
        is_active = bool(request.data.get("is_active", False))
        try:
            row, changed = set_service_active(
                city,
                service,
                category,
                is_active,
                actor=request.user,
                reason=request.data.get("reason", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ServiceUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        return Response(
            {
                "changed": changed,
                "service": service,
                "category": category,
                "is_active": row.is_active,
                "matrix": services_for_city(city),
                "message": (
                    f"{SERVICE_LABELS.get(service, service)} · {category} "
                    f"{'activated' if is_active else 'deactivated'} for {city.name}."
                ),
            }
        )


class CityPricingView(CityManagementBaseView):
    """GET — city pricing. POST — configure pricing for this city only."""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "city_id": city.pk,
                "city_name": city.name,
                "pricing": get_pricing(city),
                "capabilities": self.capabilities(request),
            }
        )

    def post(self, request, city_id):
        if not can_manage_cities(request.user):
            return Response(
                {"detail": "You are not authorized to change city pricing."},
                status=status.HTTP_403_FORBIDDEN,
            )
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)

        activate = bool(request.data.get("activate", False))
        if activate and not can_ceo_city_actions(request.user):
            return Response(
                {
                    "detail": (
                        "Activating live pricing requires Founder/CEO authorization."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            _profile, _created, changed = update_pricing(
                city,
                request.data,
                actor=request.user,
                reason=request.data.get("reason", ""),
                activate=activate,
            )
        except ServiceUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except Exception as exc:  # validation errors from full_clean
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "city_id": city.pk,
                "changed_fields": sorted(changed),
                "pricing": get_pricing(city),
                "message": (
                    "City pricing updated. Existing pricing rules in other cities "
                    "were not modified or copied."
                ),
            }
        )


class CityPerformanceView(CityManagementBaseView):
    """GET — verified city-level reporting for the CEO dashboard."""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "city_id": city.pk,
                "performance": city_performance(city),
                "source": (
                    "Verified database counts. Couriers are excluded from driver "
                    "counts; only completed rides/deliveries contribute money; "
                    "wallet liabilities are never counted as revenue."
                ),
            }
        )


class CityPeopleView(CityManagementBaseView):
    """GET — drivers and couriers operating in a city."""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(people_by_city(city))


class CityCoverageView(CityManagementBaseView):
    """GET — is a coordinate inside a configured service area?"""

    def get(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            latitude = float(request.query_params.get("latitude"))
            longitude = float(request.query_params.get("longitude"))
        except (TypeError, ValueError):
            return Response(
                {"detail": "latitude and longitude query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(coverage_check(city, latitude, longitude))


class CityServiceAreaView(CityManagementBaseView):
    """POST — define an operational boundary for a city (authorized admins)."""

    permission_classes = [IsCityManager]

    def post(self, request, city_id):
        city = self.get_city(city_id)
        if city is None:
            return Response({"detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)
        if not city_management_ready():
            return Response(
                {
                    "detail": f"Service areas require migration {CITY_MANAGEMENT_MIGRATION}.",
                    "requires_migration": CITY_MANAGEMENT_MIGRATION,
                },
                status=status.HTTP_409_CONFLICT,
            )
        name = (request.data.get("name") or "Main area").strip()
        area, _created = CityServiceArea.objects.update_or_create(
            city=city,
            name=name,
            defaults={
                "center_latitude": request.data.get("center_latitude"),
                "center_longitude": request.data.get("center_longitude"),
                "radius_km": request.data.get("radius_km"),
                "polygon": request.data.get("polygon"),
                "is_active": bool(request.data.get("is_active", True)),
                "notes": request.data.get("notes", ""),
            },
        )
        try:
            area.full_clean(exclude=["city"])
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        area.save()

        from .services import ACTION_UPDATE, audit

        audit(
            request.user,
            ACTION_UPDATE,
            city,
            field_name=f"service_area.{area.name}",
            new_value=str(
                {
                    "center": [area.center_latitude, area.center_longitude],
                    "radius_km": area.radius_km,
                    "polygon_points": len(area.polygon or []),
                }
            ),
            reason=request.data.get("reason", "Service area configured"),
        )
        return Response(
            {
                "id": area.pk,
                "name": area.name,
                "city_id": city.pk,
                "message": f"Service area '{area.name}' saved for {city.name}.",
            },
            status=status.HTTP_201_CREATED if _created else status.HTTP_200_OK,
        )


class CityAuditLogView(CityManagementBaseView):
    """GET — administrative change history for City Management."""

    def get(self, request):
        from app_settings.models import PricingAuditLog

        entries = PricingAuditLog.objects.filter(model_name="cities.City").select_related(
            "user"
        )
        city_id = request.query_params.get("city_id")
        if city_id:
            entries = entries.filter(object_id=str(city_id))
        entries = entries.order_by("-created_at")[: int(request.query_params.get("limit", 100))]
        return Response(
            {
                "count": len(entries),
                "entries": [
                    {
                        "id": entry.pk,
                        "action": entry.action,
                        "city_id": entry.object_id,
                        "city": entry.object_repr,
                        "field_name": entry.field_name,
                        "old_value": entry.old_value,
                        "new_value": entry.new_value,
                        "reason": entry.reason,
                        "actor": entry.user.get_username() if entry.user_id else "",
                        "created_at": entry.created_at,
                    }
                    for entry in entries
                ],
            }
        )


class CityDuplicatesView(CityManagementBaseView):
    """GET — legacy duplicate city rows, for CEO review. Nothing is deleted."""

    def get(self, request):
        groups = duplicate_city_groups()
        return Response(
            {
                "count": len(groups),
                "groups": groups,
                "message": (
                    "Duplicate rows are reported only. No city, identifier or "
                    "relationship has been deleted or overwritten."
                ),
            }
        )


class PublicCityAvailabilityView(APIView):
    """GET — public city/service availability for Yala Rider, Driver, Delivery.

    Lets every app show dynamic city selection and a clear unavailable-service
    message, and lets booking flows refuse a city where the service is not live.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        from .services import service_available

        city_id = request.query_params.get("city_id")
        service = (request.query_params.get("service") or "").strip()
        category = (request.query_params.get("category") or "").strip()

        cities = City.objects.filter(is_active=True).select_related("region")
        if city_id:
            cities = cities.filter(pk=city_id)

        payload = []
        for city in cities:
            matrix = services_for_city(city)
            payload.append(
                {
                    "id": city.pk,
                    "name": city.name,
                    "name_fr": city.name_fr,
                    "name_ar": city.name_ar,
                    "region": city.region.name,
                    "latitude": city.latitude,
                    "longitude": city.longitude,
                    "operational_status": serialize_city(city)["operational_status"],
                    "services": {
                        entry_service: {
                            "label": entry["label"],
                            "available": entry["any_active"],
                            "categories": {
                                row["category"]: row["is_active"]
                                for row in entry["categories"]
                            },
                        }
                        for entry_service, entry in (matrix.get("services") or {}).items()
                    },
                }
            )

        response = {"cities": payload, "count": len(payload)}
        if service:
            response["requested_service"] = service
            response["requested_category"] = category
            if city_id and payload:
                city = cities.first()
                response["available"] = service_available(city, service, category or None)
                response["message"] = (
                    f"{SERVICE_LABELS.get(service, service)} is available in {city.name}."
                    if response["available"]
                    else f"{SERVICE_LABELS.get(service, service)} is not available in "
                    f"{city.name} yet."
                )
        return Response(response)




