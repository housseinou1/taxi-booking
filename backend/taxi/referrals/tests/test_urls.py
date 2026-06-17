"""Minimal URL configuration for referrals API tests.

Avoids importing the full project URLs which pull in firebase_admin and
other dependencies not available in the test environment.
"""
from django.urls import path, include

urlpatterns = [
    path("referrals/", include("referrals.urls")),
]
