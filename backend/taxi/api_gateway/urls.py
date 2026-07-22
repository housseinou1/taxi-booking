"""Phase 38 — API Gateway URL configuration."""

from django.urls import include, path

from .views import (
    WebhookSubscriptionDetailView,
    WebhookSubscriptionListCreateView,
    api_key_create,
    api_key_list,
    api_key_revoke,
    api_key_rotate,
    developer_portal_usage,
    gateway_analytics,
    gateway_ceo_dashboard,
    gateway_docs,
    gateway_logs,
    PartnerApplicationDetailView,
    PartnerApplicationListCreateView,
    PartnerOrganizationDetailView,
    PartnerOrganizationListCreateView,
    partner_deliveries,
    partner_driver_availability,
    partner_invoices,
    partner_merchant_orders,
    partner_notifications,
    partner_organization_approve,
    partner_payments,
    partner_reports,
    partner_ride_detail,
    partner_rides,
    partner_wallet,
    trigger_webhook_event,
)

app_name = "api_gateway"

partner_urlpatterns = [
    path("rides/", partner_rides, name="partner-rides"),
    path("rides/<int:ride_id>/", partner_ride_detail, name="partner-ride-detail"),
    path("deliveries/", partner_deliveries, name="partner-deliveries"),
    path("merchant-orders/", partner_merchant_orders, name="partner-merchant-orders"),
    path("driver-availability/", partner_driver_availability, name="partner-driver-availability"),
    path("wallet/", partner_wallet, name="partner-wallet"),
    path("payments/", partner_payments, name="partner-payments"),
    path("invoices/", partner_invoices, name="partner-invoices"),
    path("reports/", partner_reports, name="partner-reports"),
    path("notifications/", partner_notifications, name="partner-notifications"),
]


developer_urlpatterns = [
    path("organizations/", PartnerOrganizationListCreateView.as_view(), name="partner-organization-list"),
    path("organizations/<int:pk>/", PartnerOrganizationDetailView.as_view(), name="partner-organization-detail"),
    path("organizations/<int:pk>/approve/", partner_organization_approve, name="partner-organization-approve"),
    path("applications/", PartnerApplicationListCreateView.as_view(), name="partner-application-list"),
    path("applications/<int:pk>/", PartnerApplicationDetailView.as_view(), name="partner-application-detail"),
    path("api-keys/", api_key_list, name="api-key-list"),
    path("api-keys/create/", api_key_create, name="api-key-create"),
    path("api-keys/<int:pk>/revoke/", api_key_revoke, name="api-key-revoke"),
    path("api-keys/<int:pk>/rotate/", api_key_rotate, name="api-key-rotate"),
    path("webhooks/", WebhookSubscriptionListCreateView.as_view(), name="webhook-list"),
    path("webhooks/<int:pk>/", WebhookSubscriptionDetailView.as_view(), name="webhook-detail"),
    path("usage/", developer_portal_usage, name="developer-portal-usage"),
    path("docs/", gateway_docs, name="gateway-docs"),
]


admin_urlpatterns = [
    path("analytics/", gateway_analytics, name="gateway-analytics"),
    path("ceo-dashboard/", gateway_ceo_dashboard, name="gateway-ceo-dashboard"),
    path("logs/", gateway_logs, name="gateway-logs"),
    path("webhooks/trigger/", trigger_webhook_event, name="trigger-webhook-event"),
]

urlpatterns = [
    path("v1/partner/", include(partner_urlpatterns)),
    path("developer/", include(developer_urlpatterns)),
    path("admin/", include(admin_urlpatterns)),
]
