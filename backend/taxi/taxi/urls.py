from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    path("rides/", include("taxi.rides.urls")),

    path("drivers/", include("taxi.drivers.urls")),

    path("payments/", include("payments.urls")),
]