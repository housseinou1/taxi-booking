from django.urls import path
from .views import get_messages, send_message, unread_count

urlpatterns = [
    path("<int:ride_id>/messages/", get_messages),
    path("<int:ride_id>/send/", send_message),
    path("<int:ride_id>/unread/", unread_count),
]
