from django.urls import path
from .views import subscribe_push, unsubscribe_push
from .views_device import register_device

urlpatterns = [
    path("push/subscribe/", subscribe_push),
    path("push/unsubscribe/", unsubscribe_push),
    path("register-device/", register_device),
]
