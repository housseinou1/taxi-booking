from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from taxi.drivers.urls import admin_document_urlpatterns, admin_qr_urlpatterns
from taxi.drivers.views_verification import VerifyDriverView
from taxi.rides.share_admin_views import share_analytics, share_analytics_chart
from taxi.ai_support import support_ai
from health.views import readiness


urlpatterns = [
    path("health/", readiness, name="health"),
    path("api/health/", include("health.urls")),

    # Admin document review endpoints (before Django admin catch-all)
    path("admin/documents/", include(admin_document_urlpatterns)),

    # Admin QR verification endpoints
    path("api/v1/admin/", include(admin_qr_urlpatterns)),

    # QR Code Verification endpoint (rider-facing)
    path("api/v1/verify-driver/", VerifyDriverView.as_view(), name="api-verify-driver"),

    # Admin Share Analytics API
    path("api/admin/share/analytics/", share_analytics, name="share-analytics"),
    path("api/admin/share/analytics/chart/", share_analytics_chart, name="share-analytics-chart"),
    path("support/ai/", support_ai, name="support-ai"),

    path("admin/", admin.site.urls),

    path("auth/", include("authapp.urls")),

    path("locations/", include("locations.urls")),

    path("rides/", include("taxi.rides.urls")),

    path("drivers/", include("taxi.drivers.urls")),

    path("payments/", include("payments.urls")),

    path("notifications/", include("notifications.urls")),

    path("chat/", include("chat.urls")),

    path("promotions/", include("promotions.urls")),

    path("deliveries/", include("deliveries.urls")),

    path("merchants/", include("merchants.urls")),

    path("safety/", include("safety.urls")),

    path("security/", include("security.urls")),

    path("legal/", include("legal.urls")),

    path("cities/", include("cities.urls")),

    path("features/", include("features.urls")),

    path("intercity/", include("intercity.urls")),

    path("shifts/", include("shifts.urls")),

    path("incentives/", include("incentives.urls")),

    path("referrals/", include("referrals.urls")),

    path("operations/", include("operations.urls")),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
