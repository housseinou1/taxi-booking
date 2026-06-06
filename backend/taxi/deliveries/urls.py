from django.urls import path

from .views import (
    accept_delivery,
    available_deliveries,
    cancel_delivery,
    confirm_delivery,
    my_deliveries,
    pickup_delivery,
    request_delivery,
    start_delivery,
)


urlpatterns = [
    path("request/", request_delivery),
    path("available/", available_deliveries),
    path("mine/", my_deliveries),
    path("<int:delivery_id>/accept/", accept_delivery),
    path("<int:delivery_id>/pickup/", pickup_delivery),
    path("<int:delivery_id>/start/", start_delivery),
    path("<int:delivery_id>/confirm/", confirm_delivery),
    path("<int:delivery_id>/cancel/", cancel_delivery),
]
