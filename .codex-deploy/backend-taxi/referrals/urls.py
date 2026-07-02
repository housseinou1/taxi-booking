from django.urls import path, include

app_name = "referrals"

urlpatterns = [
    path("rider/", include("referrals.api.rider_urls")),
    path("driver/", include("referrals.api.driver_urls")),
    path("admin/", include("referrals.api.admin_urls")),
]
