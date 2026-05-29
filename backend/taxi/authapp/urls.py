from django.urls import path

from .views import (
    RegisterView,
    approve_rider,
    block_user,
    login_view,
    me,
    reject_rider,
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

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", login_view),
    path("me/", me),
    path("identity/update/", update_identity),
    path("users/", user_list),
    path("users/<int:user_id>/approve-rider/", approve_rider),
    path("users/<int:user_id>/reject-rider/", reject_rider),
    path("users/<int:user_id>/block/", block_user),
    path("users/<int:user_id>/unblock/", unblock_user),
    # Email verification
    path("email/send-verification/", send_verification_email),
    path("email/verify/", verify_email),
    # Password reset
    path("password/reset/", request_password_reset),
    path("password/reset/confirm/", confirm_password_reset),
]
