from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView
from authapp.views import EmailTokenObtainPairView


urlpatterns = [
    path("admin/", admin.site.urls),

    path("auth/", include("authapp.urls")),
    path("api/token/", EmailTokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/token/verify/", TokenVerifyView.as_view()),

    path("rides/", include("taxi.rides.urls")),

    path("drivers/", include("taxi.drivers.urls")),

    path("payments/", include("payments.urls")),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
