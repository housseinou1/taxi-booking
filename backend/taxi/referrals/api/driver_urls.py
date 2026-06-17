from django.urls import path

from referrals.api.driver_views import (
    driver_referral_code,
    driver_referral_status,
    driver_referral_validate,
)

urlpatterns = [
    path("code/", driver_referral_code, name="driver-referral-code"),
    path("status/", driver_referral_status, name="driver-referral-status"),
    path("validate/", driver_referral_validate, name="driver-referral-validate"),
]
