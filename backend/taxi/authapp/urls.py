from django.urls import path

from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    EmailTokenObtainPairView,
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

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", login_view),
    path("token/", EmailTokenObtainPairView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("token/verify/", TokenVerifyView.as_view()),
    path("me/", me),
    path("identity/update/", update_identity),
    path("users/", user_list),
    path("users/<int:user_id>/approve-rider/", approve_rider),
    path("users/<int:user_id>/reject-rider/", reject_rider),
    path("users/<int:user_id>/block/", block_user),
    path("users/<int:user_id>/unblock/", unblock_user),
]
