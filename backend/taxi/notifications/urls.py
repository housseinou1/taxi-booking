from django.urls import path
from .views import subscribe_push, unsubscribe_push, register_fcm_token, unregister_fcm_token, notification_history, mark_notifications_read
from .views_device import register_device

urlpatterns = [
    path("push/subscribe/", subscribe_push),
    path("push/unsubscribe/", unsubscribe_push),
    path("register-device/", register_device),
    path("fcm/register/", register_fcm_token),
    path("fcm/unregister/", unregister_fcm_token),
    path("history/", notification_history),
    path("read/", mark_notifications_read),
]
