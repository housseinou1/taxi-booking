"""Minimal URL configuration for authapp tests.

Only includes authapp URLs to avoid importing modules with heavy
dependencies (e.g., firebase_admin) that are not needed for
registration tests.
"""

from django.urls import path, include

urlpatterns = [
    path("auth/", include("authapp.urls")),
]
