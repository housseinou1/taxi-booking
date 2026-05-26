from django.urls import path

from .views import (
    save_payment_method,
    my_payment_methods,
    create_payment,
    my_payments,
    rider_mark_paid,
    driver_confirm_payment,
    my_payout_methods,
    withdrawal_requests,
    request_withdrawal,
    approve_withdrawal,
    reject_withdrawal,
    save_payout_method,
)

urlpatterns = [
    path("methods/save/", save_payment_method),
    path("methods/", my_payment_methods),

    path("create/", create_payment),
    path("my-payments/", my_payments),

    path("mark-paid/<int:ride_id>/", rider_mark_paid),
    path("confirm-payment/<int:ride_id>/", driver_confirm_payment),

    path("payout-methods/", my_payout_methods),
    path("payout-methods/save/", save_payout_method),
    path("withdrawals/", withdrawal_requests),
    path("withdrawals/request/", request_withdrawal),
    path("withdrawals/<int:withdrawal_id>/approve/", approve_withdrawal),
    path("withdrawals/<int:withdrawal_id>/reject/", reject_withdrawal),
]
