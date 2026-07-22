from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.my_loyalty_status, name="loyalty-me"),
    path("redeem/", views.redeem_loyalty_reward, name="loyalty-redeem"),
]
