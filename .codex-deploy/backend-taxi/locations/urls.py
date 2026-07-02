from django.urls import path

from .views import (
    CityAnalyticsView,
    CityDetailView,
    CityListCreateView,
    CityPricingDetailView,
    CityPricingListCreateView,
    CommuneDetailView,
    CommuneListCreateView,
    DepartmentDetailView,
    DepartmentListCreateView,
    LocalityDetailView,
    LocalityListCreateView,
    RegionListCreateView,
)


urlpatterns = [
    path("regions/", RegionListCreateView.as_view()),
    path("departments/", DepartmentListCreateView.as_view()),
    path("departments/<int:department_id>/", DepartmentDetailView.as_view()),
    path("communes/", CommuneListCreateView.as_view()),
    path("communes/<int:commune_id>/", CommuneDetailView.as_view()),
    path("localities/", LocalityListCreateView.as_view()),
    path("localities/<int:locality_id>/", LocalityDetailView.as_view()),
    path("cities/", CityListCreateView.as_view()),
    path("cities/<int:city_id>/", CityDetailView.as_view()),
    path("pricing/", CityPricingListCreateView.as_view()),
    path("pricing/<int:pricing_id>/", CityPricingDetailView.as_view()),
    path("analytics/", CityAnalyticsView.as_view()),
]
