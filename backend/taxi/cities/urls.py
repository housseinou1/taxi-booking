from django.urls import path
from .views import list_cities, city_detail, create_city, update_city, city_analytics

urlpatterns = [
    path("", list_cities),
    path("<int:city_id>/", city_detail),
    path("create/", create_city),
    path("<int:city_id>/update/", update_city),
    path("<int:city_id>/analytics/", city_analytics),
]
