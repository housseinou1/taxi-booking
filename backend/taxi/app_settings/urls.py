from django.urls import path
from .views import (
    ActivationConfirmView,
    CityComparisonView,
    PricingDashboardView,
    PricingExportView,
    PricingPreviewView,
    test_api,
)

urlpatterns = [
    path("api/test/", test_api),
    path("dashboard/", PricingDashboardView.as_view(), name="pricing_dashboard"),
    path("preview/", PricingPreviewView.as_view(), name="pricing_preview"),
    path("export/<str:fmt>/", PricingExportView.as_view(), name="pricing_export"),
    path("city-comparison/", CityComparisonView.as_view(), name="pricing_city_comparison"),
    path("activate/", ActivationConfirmView.as_view(), name="pricing_activate"),
]