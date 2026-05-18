from django.contrib import admin
from django.urls import path, include

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    path("auth/", include("authapp.urls")),
    path("rides/", include("taxi.rides.urls")),
    path("drivers/", include("taxi.drivers.urls")),
    path("payments/", include("payments.urls")),

    path("api/token/", TokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
]