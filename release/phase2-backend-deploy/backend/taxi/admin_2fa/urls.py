from django.urls import path
from .views import totp_confirm, totp_setup, totp_status, totp_verify
from .integrity import verify_integrity

urlpatterns = [
    path("setup/", totp_setup),
    path("confirm/", totp_confirm),
    path("verify/", totp_verify),
    path("status/", totp_status),
]

integrity_urlpatterns = [
    path("verify/", verify_integrity),
]
