from django.urls import path
from .integrity import verify_integrity

urlpatterns = [
    path("verify/", verify_integrity),
]
