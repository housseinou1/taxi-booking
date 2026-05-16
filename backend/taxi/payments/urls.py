from django.urls import path

from .views import (
    payment_list,
    create_test_payment,
    mark_payment_paid,
    fail_payment,
    driver_earnings,
)

urlpatterns = [
    path("", payment_list),
    path("create-test/", create_test_payment),
    path("<int:payment_id>/mark-paid/", mark_payment_paid),
    path("<int:payment_id>/fail/", fail_payment),
    path("driver/earnings/", driver_earnings),
]