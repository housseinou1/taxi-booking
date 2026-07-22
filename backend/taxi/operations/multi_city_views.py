"""Multi-City Operations Platform API views (Phase 27)."""

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .models import OpsCityProfile
from .multi_city_permissions import (
    IsMultiCityStaff,
    can_access_city,
    can_manage_city_admin,
    get_user_city_ids,
    has_national_access,
    user_permissions_payload,
)
from .multi_city_service import (
    build_city_detail,
    build_multi_city_dashboard,
    build_multi_city_export_rows,
    get_city_profile,
    list_city_profiles,
)
from .report_export import export_csv, export_pdf


def _resolve_scope(request):
    perms = user_permissions_payload(request.user)
    if perms["national"]:
        return None, True
    if perms["finance"] and not perms["operations"]:
        return perms["finance_city_ids"] or perms["city_ids"], False
    city_ids = perms["city_ids"] or perms["finance_city_ids"]
    return city_ids, perms["finance"]


def _export_response(rows, export_format, filename, title="Yala Multi-City Operations"):
    if export_format == "pdf":
        content = export_pdf(rows, title=title)
        content_type = "application/pdf"
        filename += ".pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename += ".csv"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsMultiCityStaff])
def multi_city_dashboard(request):
    city_ids, include_finance = _resolve_scope(request)
    selected = request.query_params.get("city_id")
    if selected:
        try:
            cid = int(selected)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid city_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not can_access_city(request.user, cid, scope="operations") and not can_access_city(
            request.user, cid, scope="finance"
        ):
            return Response({"detail": "City access denied."}, status=status.HTTP_403_FORBIDDEN)
        city_ids = [cid]

    payload = build_multi_city_dashboard(city_ids=city_ids, include_finance=include_finance)
    payload["permissions"] = user_permissions_payload(request.user)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsMultiCityStaff])
def multi_city_cities(request):
    city_ids, _ = _resolve_scope(request)
    return Response({"cities": list_city_profiles(city_ids)})


@api_view(["GET", "PATCH"])
@permission_classes([IsMultiCityStaff])
def multi_city_city_detail(request, city_id):
    if not can_access_city(request.user, city_id, "operations") and not can_access_city(
        request.user, city_id, "finance"
    ):
        if not has_national_access(request.user):
            return Response({"detail": "City access denied."}, status=status.HTTP_403_FORBIDDEN)

    profile = get_object_or_404(OpsCityProfile.objects.select_related("city"), city_id=city_id)

    if request.method == "GET":
        scope_finance_only = (
            not has_national_access(request.user)
            and can_access_city(request.user, city_id, "finance")
            and not can_access_city(request.user, city_id, "operations")
        )
        detail = build_city_detail(city_id)
        if scope_finance_only:
            detail = {"admin": detail.get("admin"), "financial": detail.get("financial")}
        return Response(detail)

    if not can_manage_city_admin(request.user):
        return Response({"detail": "CEO permission required to update city."}, status=status.HTTP_403_FORBIDDEN)

    data = request.data or {}
    before = get_city_profile(city_id)
    for field in ("status", "timezone", "currency", "notes", "service_zones"):
        if field in data:
            setattr(profile, field, data[field])
    for field in ("operations_manager_id", "finance_manager_id", "support_manager_id"):
        if field in data:
            setattr(profile, field, data.get(field))
    if "is_active" in data:
        profile.city.is_active = bool(data["is_active"])
        profile.city.save(update_fields=["is_active"])
    profile.save()

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(city_id),
        summary=f"Updated multi-city profile for {profile.city.name}",
        details={"before": before, "after": get_city_profile(city_id)},
    )
    return Response(get_city_profile(city_id))


@api_view(["GET"])
@permission_classes([IsMultiCityStaff])
def multi_city_export(request):
    if not has_national_access(request.user):
        return Response({"detail": "CEO permission required for export."}, status=status.HTTP_403_FORBIDDEN)
    export_format = request.query_params.get("export_format", "csv")
    rows = build_multi_city_export_rows()
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id="multi_city_export",
        summary=f"Exported multi-city dashboard ({export_format})",
        details={"row_count": len(rows)},
    )
    return _export_response(rows, export_format, "multi-city-operations")
