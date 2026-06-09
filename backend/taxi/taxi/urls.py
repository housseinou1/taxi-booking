from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from taxi.drivers.urls import admin_document_urlpatterns
from taxi.rides.share_admin_views import share_analytics, share_analytics_chart
from taxi.ai_support import support_ai


urlpatterns = [
    # Admin document review endpoints (before Django admin catch-all)
    path("admin/documents/", include(admin_document_urlpatterns)),

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

    path("safety/", include("safety.urls")),

    path("cities/", include("cities.urls")),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
