"""Partner self-service portal views (Phase 32)."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from partners.permissions import IsPartnerPortalUser

from operations.partner_platform_service import build_partner_dashboard


@api_view(["GET"])
@permission_classes([IsPartnerPortalUser])
def partner_portal_dashboard(request):
    return Response(build_partner_dashboard(request.user.partner_profile))


@api_view(["GET"])
@permission_classes([IsPartnerPortalUser])
def partner_portal_settlements(request):
    partner = request.user.partner_profile
    settlements = partner.settlements.all()[:50]
    return Response(
        [
            {
                "id": s.id,
                "period_type": s.period_type,
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "gross_revenue": float(s.gross_revenue),
                "platform_commission": float(s.platform_commission),
                "partner_payout": float(s.partner_payout),
                "status": s.status,
                "invoice_reference": s.invoice_reference,
                "paid_at": s.paid_at.isoformat() if s.paid_at else None,
            }
            for s in settlements
        ]
    )
