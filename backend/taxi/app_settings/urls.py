from django.urls import path
from .views import PricingDashboardView, test_api

urlpatterns = [
    path("api/test/", test_api),
    path("dashboard/", PricingDashboardView.as_view(), name="pricing_dashboard"),
]