from django.urls import path
from .views import subscribe_push, unsubscribe_push

urlpatterns = [
    path("push/subscribe/", subscribe_push),
    path("push/unsubscribe/", unsubscribe_push),
]
