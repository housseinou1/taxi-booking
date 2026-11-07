from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    admin_driver_activity,
    admin_rider_activity,
    admin_rider_detail,
    admin_rider_document,
    admin_riders_list,
    admin_rider_support,
    approve_rider,
    block_user,
    delete_rider,
    login_view,
    logout_all_devices,
    me,
    my_devices,
    reactivate_rider,
    reject_rider,
    suspend_rider,
    unblock_user,
    update_identity,
    user_list,
)
from .email_views import (
    send_verification_email,
    verify_email,
    request_password_reset,
    confirm_password_reset,
)
from .phone_views import request_phone_verification, verify_phone
from .password_reset_views import forgot_password, reset_password, verify_reset_code

from operations.city_transfer_views import request_operating_city_transfer

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", login_view),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("me/", me),
    path("identity/update/", update_identity),
    path("operating-city/transfer-request/", request_operating_city_transfer),
    path("logout-all-devices/", logout_all_devices),
    path("devices/", my_devices),
    path("users/", user_list),
    path("users/<int:user_id>/approve-rider/", approve_rider),
    path("users/<int:user_id>/reject-rider/", reject_rider),
    path("users/<int:user_id>/delete-rider/", delete_rider),
    path("users/<int:user_id>/block/", block_user),
    path("users/<int:user_id>/unblock/", unblock_user),
    # Riders Management (additive, IsAdminUser-gated)
    path("admin/riders/", admin_riders_list),
    path("admin/riders/<int:rider_id>/", admin_rider_detail),
    path("admin/riders/<int:rider_id>/document/", admin_rider_document),
    path("admin/riders/<int:rider_id>/support/", admin_rider_support),
    path("users/<int:user_id>/suspend/", suspend_rider),
    path("users/<int:user_id>/reactivate/", reactivate_rider),
    path("admin/rider/<int:rider_id>/activity/", admin_rider_activity),
    path("admin/driver/<int:driver_id>/activity/", admin_driver_activity),
    # Email verification
    path("email/send-verification/", send_verification_email),
    path("email/verify/", verify_email),
    path("phone/request-code/", request_phone_verification),
    path("phone/verify/", verify_phone),
    path("forgot-password/", forgot_password),
    path("verify-reset-code/", verify_reset_code),
    path("reset-password/", reset_password),
    # Password reset
    path("password/reset/", request_password_reset),
    path("password/reset/confirm/", confirm_password_reset),
]
