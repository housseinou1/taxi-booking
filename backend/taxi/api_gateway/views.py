"""Phase 38 — API Gateway & Integration Platform views."""

from __future__ import annotations

from pathlib import Path

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from deliveries.models import Delivery
from merchants.models import MerchantOrder, MerchantPayout, MerchantSettlement
from notifications.services import send_push_notification
from operations.executive_permissions import (
    IsGatewayAdminStaff,
    IsGatewayCeoStaff,
    can_manage_api_gateway,
)
from operations.executive_service import build_finance_dashboard, build_live_metrics
from payments.models import PaymentRecord, WalletAccount
from security.services.audit_service import log_from_request
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .models import APIKey, APIGatewayLog, PartnerApplication, PartnerOrganization, WebhookSubscription
from .permissions import HasAPIKey, HasScope
from .serializers import (
    APIGatewayLogSerializer,
    APIKeyListSerializer,
    PartnerApplicationSerializer,
    PartnerOrganizationSerializer,
    WebhookSubscriptionSerializer,
)
from .utils import build_gateway_analytics, build_gateway_ceo_dashboard, dispatch_webhook_event


GRACE_PERIOD_DAYS = 7
DOCS_DIR = Path(__file__).resolve().parents[3] / "release"


# ─── Developer Portal Permissions ──────────────────────────────


class IsPartnerAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if can_manage_api_gateway(user):
            return True
        return PartnerOrganization.objects.filter(admin_user=user).exists()


class IsOwnOrganization(BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user
        if can_manage_api_gateway(user):
            return True
        return obj.admin_user == user


class IsOwnApplication(BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user
        if can_manage_api_gateway(user):
            return True
        return obj.organization.admin_user == user


def _user_can_access_application(user, app: PartnerApplication) -> bool:
    if can_manage_api_gateway(user):
        return True
    return app.organization.admin_user == user


def _portal_queryset_for_user(user, model, org_field="organization__admin_user"):
    if can_manage_api_gateway(user):
        return model.objects.all()
    return model.objects.filter(**{org_field: user})


# ─── Developer Portal ─────────────────────────────────────────


class PartnerOrganizationListCreateView(generics.ListCreateAPIView):
    serializer_class = PartnerOrganizationSerializer
    permission_classes = [IsAuthenticated, IsPartnerAdmin]

    def get_queryset(self):
        return _portal_queryset_for_user(self.request.user, PartnerOrganization, "admin_user")

    def perform_create(self, serializer):
        serializer.save(admin_user=self.request.user, status="pending")


class PartnerOrganizationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = PartnerOrganizationSerializer
    permission_classes = [IsAuthenticated, IsOwnOrganization]
    queryset = PartnerOrganization.objects.all()


@api_view(["POST"])
@permission_classes([IsGatewayAdminStaff])
def partner_organization_approve(request, pk):
    org = get_object_or_404(PartnerOrganization, pk=pk)
    org.status = request.data.get("status", "approved")
    org.save(update_fields=["status"])
    log_from_request(
        request,
        action="admin_action",
        entity_type="partner_organization",
        entity_id=str(pk),
        summary=f"Partner organization {org.name} set to {org.status}",
        details={"status": org.status},
    )
    return Response({"id": org.id, "status": org.status})


class PartnerApplicationListCreateView(generics.ListCreateAPIView):
    serializer_class = PartnerApplicationSerializer
    permission_classes = [IsAuthenticated, IsPartnerAdmin]

    def get_queryset(self):
        return _portal_queryset_for_user(self.request.user, PartnerApplication)

    def perform_create(self, serializer):
        org_id = self.request.data.get("organization")
        org = get_object_or_404(PartnerOrganization, pk=org_id)
        if org.admin_user != self.request.user and not can_manage_api_gateway(self.request.user):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You cannot create applications for this organization.")
        serializer.save(organization=org)


class PartnerApplicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PartnerApplicationSerializer
    permission_classes = [IsAuthenticated, IsOwnApplication]
    queryset = PartnerApplication.objects.all()


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsPartnerAdmin])
def api_key_create(request):
    app_id = request.data.get("application")
    app = get_object_or_404(PartnerApplication, pk=app_id)
    if not _user_can_access_application(request.user, app):
        return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)
    raw, prefix, key_hash, secret = APIKey.generate_key()
    key = APIKey.objects.create(
        application=app,
        name=request.data.get("name", "Default key"),
        prefix=prefix,
        key_hash=key_hash,
        secret=secret,
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="api_key",
        entity_id=str(key.id),
        summary=f"Created API key for {app.name}",
        details={"prefix": prefix},
    )
    return Response(
        {
            "id": key.id,
            "name": key.name,
            "api_key": raw,
            "secret": secret,
            "prefix": prefix,
            "expires_at": key.expires_at,
            "created_at": key.created_at,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsPartnerAdmin])
def api_key_list(request):
    app_id = request.query_params.get("application")
    qs = APIKey.objects.select_related("application")
    if app_id:
        app = get_object_or_404(PartnerApplication, pk=app_id)
        if not _user_can_access_application(request.user, app):
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)
        qs = qs.filter(application=app)
    elif not can_manage_api_gateway(request.user):
        qs = qs.filter(application__organization__admin_user=request.user)
    return Response(APIKeyListSerializer(qs.order_by("-created_at"), many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsPartnerAdmin])
def api_key_rotate(request, pk):
    key = get_object_or_404(APIKey, pk=pk)
    if not _user_can_access_application(request.user, key.application):
        return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

    raw, prefix, key_hash, secret = APIKey.generate_key()
    grace_until = timezone.now() + timezone.timedelta(days=GRACE_PERIOD_DAYS)
    key.revoked = True
    key.revoked_at = timezone.now()
    key.grace_period_until = grace_until
    key.save(update_fields=["revoked", "revoked_at", "grace_period_until"])

    new_key = APIKey.objects.create(
        application=key.application,
        name=f"{key.name} (rotated)",
        prefix=prefix,
        key_hash=key_hash,
        secret=secret,
        rotated_from=key,
    )
    log_from_request(
        request,
        action="admin_action",
        entity_type="api_key",
        entity_id=str(new_key.id),
        summary=f"Rotated API key {key.prefix}",
        details={"old_prefix": key.prefix, "new_prefix": prefix, "grace_until": grace_until.isoformat()},
    )
    return Response(
        {
            "id": new_key.id,
            "name": new_key.name,
            "api_key": raw,
            "secret": secret,
            "prefix": prefix,
            "previous_key_id": key.id,
            "grace_period_until": grace_until.isoformat(),
            "created_at": new_key.created_at,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsPartnerAdmin])
def api_key_revoke(request, pk):
    key = get_object_or_404(APIKey, pk=pk)
    if not _user_can_access_application(request.user, key.application):
        return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)
    key.revoked = True
    key.revoked_at = timezone.now()
    key.save(update_fields=["revoked", "revoked_at"])
    log_from_request(
        request,
        action="admin_action",
        entity_type="api_key",
        entity_id=str(pk),
        summary="Revoked API key",
        details={"prefix": key.prefix},
    )
    return Response({"id": key.id, "revoked": True})


class WebhookSubscriptionListCreateView(generics.ListCreateAPIView):
    serializer_class = WebhookSubscriptionSerializer
    permission_classes = [IsAuthenticated, IsPartnerAdmin]

    def get_queryset(self):
        return _portal_queryset_for_user(self.request.user, WebhookSubscription, "application__organization__admin_user")

    def perform_create(self, serializer):
        app_id = self.request.data.get("application")
        app = get_object_or_404(PartnerApplication, pk=app_id)
        if not _user_can_access_application(self.request.user, app):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You cannot create webhooks for this application.")
        serializer.save(application=app)


class WebhookSubscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WebhookSubscriptionSerializer
    permission_classes = [IsAuthenticated, IsPartnerAdmin]

    def get_queryset(self):
        return _portal_queryset_for_user(self.request.user, WebhookSubscription, "application__organization__admin_user")


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsPartnerAdmin])
def developer_portal_usage(request):
    user = request.user
    if can_manage_api_gateway(user):
        app_ids = PartnerApplication.objects.values_list("id", flat=True)
    else:
        app_ids = PartnerApplication.objects.filter(
            organization__admin_user=user
        ).values_list("id", flat=True)

    logs = APIGatewayLog.objects.filter(application_id__in=app_ids)
    return Response(
        {
            "total_calls": logs.count(),
            "success": logs.filter(status_code__gte=200, status_code__lt=300).count(),
            "errors": logs.filter(status_code__gte=400).count(),
            "recent": APIGatewayLogSerializer(logs.order_by("-created_at")[:50], many=True).data,
        }
    )


# ─── Partner API Endpoints ────────────────────────────────────


def _partner_app(request):
    return getattr(request, "api_gateway_application", None)


@extend_schema(tags=["Partner API"], parameters=[OpenApiParameter(name="status", required=False, type=str)])
@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_rides(request):
    """List recent rides with optional status filter. Scope: rides:read"""
    app = _partner_app(request)
    status_filter = request.query_params.get("status")
    qs = Ride.objects.select_related("rider", "driver").order_by("-created_at")[:100]
    if status_filter:
        qs = qs.filter(status=status_filter)
    data = [
        {
            "id": r.id,
            "status": r.status,
            "pickup": r.pickup,
            "destination": r.destination,
            "driver_id": r.driver_id,
            "rider_id": r.rider_id,
            "created_at": r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in qs
    ]
    return Response({"application": app.name if app else None, "rides": data})


partner_rides.required_scopes = ["rides:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_ride_detail(request, ride_id):
    app = _partner_app(request)
    ride = get_object_or_404(Ride, id=ride_id)
    return Response(
        {
            "application": app.name if app else None,
            "ride": {
                "id": ride.id,
                "status": ride.status,
                "pickup": ride.pickup,
                "destination": ride.destination,
                "driver_id": ride.driver_id,
                "rider_id": ride.rider_id,
                "created_at": ride.created_at.isoformat(),
                "completed_at": ride.completed_at.isoformat() if ride.completed_at else None,
            },
        }
    )


partner_ride_detail.required_scopes = ["rides:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_deliveries(request):
    app = _partner_app(request)
    qs = Delivery.objects.order_by("-created_at")[:100]
    data = [
        {
            "id": d.id,
            "status": d.status,
            "pickup": d.pickup,
            "destination": d.destination,
            "driver_id": d.driver_id,
            "customer_id": d.customer_id,
            "created_at": d.created_at.isoformat(),
        }
        for d in qs
    ]
    return Response({"application": app.name if app else None, "deliveries": data})


partner_deliveries.required_scopes = ["deliveries:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_merchant_orders(request):
    app = _partner_app(request)
    qs = MerchantOrder.objects.order_by("-created_at")[:100]
    data = [
        {
            "id": o.id,
            "status": o.status,
            "merchant_id": o.merchant_id,
            "total": str(o.total),
            "payment_status": o.payment_status,
            "created_at": o.created_at.isoformat(),
        }
        for o in qs
    ]
    return Response({"application": app.name if app else None, "orders": data})


partner_merchant_orders.required_scopes = ["merchants:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_driver_availability(request):
    app = _partner_app(request)
    approved = DriverProfile.objects.filter(status="approved")
    return Response(
        {
            "application": app.name if app else None,
            "approved_drivers": approved.count(),
            "online_drivers": approved.filter(is_available=True).count(),
            "approved_couriers": DriverProfile.objects.filter(
                status="approved", user__user_type="courier"
            ).count(),
        }
    )


partner_driver_availability.required_scopes = ["drivers:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_wallet(request):
    app = _partner_app(request)
    user_id = request.query_params.get("user_id")
    qs = WalletAccount.objects.all()
    if user_id:
        qs = qs.filter(user_id=user_id)
    data = [
        {"user_id": w.user_id, "balance": str(w.balance), "currency": getattr(w, "currency", "MRU")}
        for w in qs[:100]
    ]
    return Response({"application": app.name if app else None, "wallets": data})


partner_wallet.required_scopes = ["wallets:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_payments(request):
    app = _partner_app(request)
    qs = PaymentRecord.objects.order_by("-created_at")[:100]
    data = [
        {
            "id": p.id,
            "status": p.status,
            "amount": str(p.amount),
            "method": p.method,
            "ride_id": p.ride_id,
            "created_at": p.created_at.isoformat(),
        }
        for p in qs
    ]
    return Response({"application": app.name if app else None, "payments": data})


partner_payments.required_scopes = ["payments:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_invoices(request):
    app = _partner_app(request)
    payouts = MerchantPayout.objects.order_by("-created_at")[:50]
    settlements = MerchantSettlement.objects.order_by("-created_at")[:50]
    return Response(
        {
            "application": app.name if app else None,
            "payouts": [
                {"id": p.id, "merchant_id": p.merchant_id, "amount": str(p.amount), "status": p.status}
                for p in payouts
            ],
            "settlements": [
                {"id": s.id, "merchant_id": s.merchant_id, "gross_sales": str(s.gross_sales), "status": s.status}
                for s in settlements
            ],
        }
    )


partner_invoices.required_scopes = ["finance:read"]


@api_view(["GET"])
@permission_classes([HasAPIKey, HasScope])
def partner_reports(request):
    app = _partner_app(request)
    return Response(
        {
            "application": app.name if app else None,
            "live_metrics": build_live_metrics(),
            "finance_daily": build_finance_dashboard(period="daily"),
            "finance_weekly": build_finance_dashboard(period="weekly"),
        }
    )


partner_reports.required_scopes = ["reports:read"]


@api_view(["POST"])
@permission_classes([HasAPIKey, HasScope])
def partner_notifications(request):
    app = _partner_app(request)
    user_id = request.data.get("user_id")
    title = request.data.get("title", "Partner Notification")
    message = request.data.get("message", "")
    if not user_id or not message:
        return Response({"detail": "user_id and message required."}, status=status.HTTP_400_BAD_REQUEST)
    send_push_notification(
        user_id, title, message,
        extra={"source": "partner_api", "application": app.id if app else None}
    )
    return Response({"sent": True, "user_id": user_id})


partner_notifications.required_scopes = ["notifications:write"]


# ─── Webhooks & Analytics ─────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsGatewayAdminStaff])
def trigger_webhook_event(request):
    event_type = request.data.get("event_type")
    payload = request.data.get("payload", {})
    if not event_type:
        return Response({"detail": "event_type required."}, status=status.HTTP_400_BAD_REQUEST)
    results = dispatch_webhook_event(event_type, payload, request=request)
    return Response({"dispatched": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsGatewayAdminStaff])
def gateway_analytics(request):
    days = int(request.query_params.get("days", 30))
    return Response(build_gateway_analytics(days=days))


@api_view(["GET"])
@permission_classes([IsGatewayCeoStaff])
def gateway_ceo_dashboard(request):
    days = int(request.query_params.get("days", 30))
    return Response(build_gateway_ceo_dashboard(days=days))


@api_view(["GET"])
@permission_classes([IsGatewayAdminStaff])
def gateway_logs(request):
    qs = APIGatewayLog.objects.select_related("application").order_by("-created_at")[:200]
    return Response(APIGatewayLogSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def gateway_docs(request):
    guide_map = {
        "integration": "API_GATEWAY_INTEGRATION_GUIDE.md",
        "authentication": "API_GATEWAY_AUTHENTICATION_GUIDE.md",
        "webhooks": "API_GATEWAY_WEBHOOK_GUIDE.md",
        "design": "PHASE38_API_GATEWAY_DESIGN.md",
    }
    doc_type = request.query_params.get("type", "integration")
    filename = guide_map.get(doc_type, guide_map["integration"])
    path = DOCS_DIR / filename
    if not path.exists():
        return Response({"detail": "Documentation not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            "type": doc_type,
            "filename": filename,
            "content": path.read_text(encoding="utf-8"),
            "openapi_url": "/api/schema/",
            "swagger_url": "/api/docs/",
            "partner_base_url": "/api-gateway/v1/partner/",
        }
    )
