from django.urls import path

from referrals.api.rider_views import (
    rider_referral_code,
    rider_referral_share,
    rider_referral_validate,
)

urlpatterns = [
    path("code/", rider_referral_code, name="rider-referral-code"),
    path("share/", rider_referral_share, name="rider-referral-share"),
    path("validate/", rider_referral_validate, name="rider-referral-validate"),
]
