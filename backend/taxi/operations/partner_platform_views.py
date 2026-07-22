"""Partner & Franchise Platform API views (Phase 32)."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from partners.permissions import IsPartnerCeoStaff, IsPartnerFinanceStaff, IsPartnerPlatformStaff
from security.services.audit_service import log_from_request

from .cache_utils import invalidate_ops_cache
from .partner_platform_service import (
    admin_partner_action,
    approve_partner_settlement,
    assign_partner_territory,
    build_cached_partner_platform_dashboard,
    build_partner_ceo_dashboard,
    build_partner_finance_dashboard,
    build_partner_dashboard,
    generate_partner_settlement,
    register_partner,
)


@api_view(["GET"])
@permission_classes([IsPartnerPlatformStaff])
def partner_platform_dashboard(request):
    city_id = request.query_params.get("city_id")
    city_id = int(city_id) if city_id and city_id.isdigit() else None
    return Response(build_cached_partner_platform_dashboard(city_id=city_id))


@api_view(["GET"])
@permission_classes([IsPartnerCeoStaff])
def partner_platform_ceo(request):
    return Response(build_partner_ceo_dashboard())


@api_view(["GET"])
@permission_classes([IsPartnerFinanceStaff])
def partner_platform_finance(request):
    return Response(build_partner_finance_dashboard())


@api_view(["GET"])
@permission_classes([IsPartnerPlatformStaff])
def partner_platform_detail(request, partner_id):
    from partners.models import Partner

    partner = Partner.objects.filter(id=partner_id).select_related("city").first()
    if not partner:
        return Response({"detail": "Partner not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(build_partner_dashboard(partner))


@api_view(["POST"])
@permission_classes([IsPartnerPlatformStaff])
def partner_platform_register(request):
    required = ("partner_name", "contact_person", "phone", "email")
    missing = [field for field in required if not request.data.get(field)]
    if missing:
        return Response({"detail": f"Missing fields: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)

    partner = register_partner(request.data, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="partner",
        entity_id=str(partner.id),
        summary=f"Registered partner {partner.partner_name}",
        details=request.data,
    )
    invalidate_ops_cache("partner_platform_dashboard")
    return Response({"id": partner.id, "partner_name": partner.partner_name}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsPartnerPlatformStaff])
def partner_platform_action(request, partner_id):
    action = (request.data.get("action") or "").strip().lower()
    result = admin_partner_action(
        partner_id,
        action,
        request.user,
        reason=str(request.data.get("reason") or "").strip(),
    )
    if not result:
        return Response({"detail": "Invalid partner or action."}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="partner",
        entity_id=str(partner_id),
        summary=f"Partner {action}: {result['partner_name']}",
        details=request.data,
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsPartnerPlatformStaff])
def partner_platform_territory(request, partner_id):
    if not request.data.get("city_id"):
        return Response({"detail": "city_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    result, error = assign_partner_territory(partner_id, request.data, request.user)
    if error:
        return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

    log_from_request(
        request,
        action="admin_action",
        entity_type="partner_territory",
        entity_id=str(result["id"]),
        summary=f"Assigned territory {result['city_name']} / {result['zone_name']}",
        details=request.data,
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsPartnerFinanceStaff])
def partner_platform_settlement_generate(request, partner_id):
    period_type = (request.data.get("period_type") or "weekly").strip().lower()
    if period_type not in ("weekly", "monthly"):
        return Response({"detail": "period_type must be weekly or monthly."}, status=status.HTTP_400_BAD_REQUEST)

    result = generate_partner_settlement(partner_id, request.user, period_type=period_type)
    if not result:
        return Response({"detail": "Partner not found."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="partner_settlement",
        entity_id=str(result["id"]),
        summary=f"Generated partner settlement {result['invoice_reference']}",
        details=result,
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsPartnerFinanceStaff])
def partner_platform_settlement_approve(request, settlement_id):
    result = approve_partner_settlement(settlement_id, request.user)
    if not result:
        return Response({"detail": "Settlement not found or not pending."}, status=status.HTTP_404_NOT_FOUND)

    log_from_request(
        request,
        action="admin_action",
        entity_type="partner_settlement",
        entity_id=str(settlement_id),
        summary=f"Approved partner settlement {result['partner_payout']} MRU",
        details=result,
    )
    return Response(result)
