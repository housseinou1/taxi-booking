from django.urls import path

from .views import (
    save_payment_method,
    my_payment_methods,
    delete_payment_method,
    create_payment,
    my_payments,
    rider_mark_paid,
    driver_confirm_payment,
    my_payout_methods,
    owner_payout_summary,
    withdrawal_requests,
    request_withdrawal,
    approve_withdrawal,
    reject_withdrawal,
    save_payout_method,
    save_owner_payout_method,
    my_wallet,
    admin_wallet_adjustment,
    wallet_pay_ride,
)

urlpatterns = [
    path("methods/save/", save_payment_method),
    path("methods/", my_payment_methods),
    path("methods/<int:method_id>/", delete_payment_method),

    path("create/", create_payment),
    path("my-payments/", my_payments),

    path("mark-paid/<int:ride_id>/", rider_mark_paid),
    path("confirm-payment/<int:ride_id>/", driver_confirm_payment),

    path("payout-methods/", my_payout_methods),
    path("payout-methods/save/", save_payout_method),
    path("owner-payout/", owner_payout_summary),
    path("owner-payout/save/", save_owner_payout_method),
    path("withdrawals/", withdrawal_requests),
    path("withdrawals/request/", request_withdrawal),
    path("withdrawals/<int:withdrawal_id>/approve/", approve_withdrawal),
    path("withdrawals/<int:withdrawal_id>/reject/", reject_withdrawal),
    path("wallet/", my_wallet),
    path("wallet/admin-adjustment/", admin_wallet_adjustment),
    path("wallet/pay-ride/<int:ride_id>/", wallet_pay_ride),
]
