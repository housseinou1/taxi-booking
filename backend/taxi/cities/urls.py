from django.urls import path

from .views import list_cities, city_detail, create_city, update_city, city_analytics
from .views_city_management import (
    CityActivationView,
    CityAuditLogView,
    CityCoverageView,
    CityDeactivationView,
    CityDetailView,
    CityDuplicatesView,
    CityLiveView,
    CityManagementListView,
    CityPeopleView,
    CityPerformanceView,
    CityPricingView,
    CityServiceAreaView,
    CityServicesView,
    PublicCityAvailabilityView,
)

urlpatterns = [
    # ── Dynamic City Management (CEO Command Center) ──
    path("management/", CityManagementListView.as_view(), name="city-management"),
    path("management/audit/", CityAuditLogView.as_view(), name="city-management-audit"),
    path(
        "management/duplicates/",
        CityDuplicatesView.as_view(),
        name="city-management-duplicates",
    ),
    path("management/<int:city_id>/", CityDetailView.as_view(), name="city-management-detail"),
    path(
        "management/<int:city_id>/activate/",
        CityActivationView.as_view(),
        name="city-management-activate",
    ),
    path(
        "management/<int:city_id>/deactivate/",
        CityDeactivationView.as_view(),
        name="city-management-deactivate",
    ),
    path("management/<int:city_id>/live/", CityLiveView.as_view(), name="city-management-live"),
    path(
        "management/<int:city_id>/services/",
        CityServicesView.as_view(),
        name="city-management-services",
    ),
    path(
        "management/<int:city_id>/pricing/",
        CityPricingView.as_view(),
        name="city-management-pricing",
    ),
    path(
        "management/<int:city_id>/performance/",
        CityPerformanceView.as_view(),
        name="city-management-performance",
    ),
    path(
        "management/<int:city_id>/people/",
        CityPeopleView.as_view(),
        name="city-management-people",
    ),
    path(
        "management/<int:city_id>/coverage/",
        CityCoverageView.as_view(),
        name="city-management-coverage",
    ),
    path(
        "management/<int:city_id>/service-areas/",
        CityServiceAreaView.as_view(),
        name="city-management-service-areas",
    ),
    # ── Public availability for Yala Rider / Driver / Delivery ──
    path("available/", PublicCityAvailabilityView.as_view(), name="city-available"),
    # ── Existing public and admin city endpoints (unchanged) ──
    path("", list_cities),
    path("<int:city_id>/", city_detail),
    path("create/", create_city),
    path("<int:city_id>/update/", update_city),
    path("<int:city_id>/analytics/", city_analytics),
]
