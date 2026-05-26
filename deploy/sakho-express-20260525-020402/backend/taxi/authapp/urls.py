from django.urls import path

from .views import (
    RegisterView,
    block_user,
    login_view,
    me,
    unblock_user,
    update_identity,
    user_list,
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", login_view),
    path("me/", me),
    path("identity/update/", update_identity),
    path("users/", user_list),
    path("users/<int:user_id>/block/", block_user),
    path("users/<int:user_id>/unblock/", unblock_user),
]
