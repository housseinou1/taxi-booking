"""Shared driver profile resolution for authenticated API endpoints."""

from __future__ import annotations

from rest_framework import status

from .models import DriverProfile


def get_or_create_driver_profile(user):
    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "plate_number": "TEMP-PLATE",
            "vehicle_plate": "TEMP-PLATE",
            "vehicle_make": "TEMP",
            "vehicle_model": "TEMP",
            "vehicle_color": "TEMP",
        },
    )
    return profile


def is_driver_account(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if DriverProfile.objects.filter(user=user).exists():
        return True
    return getattr(user, "user_type", "rider") == "driver"


def resolve_driver_profile(user, *, auto_create: bool = False):
    """
    Resolve the DriverProfile for an authenticated user.

    Returns (profile, error_dict). error_dict is None on success and has:
      - status: HTTP status code
      - data: JSON-serializable error body
    """
    profile = (
        DriverProfile.objects.filter(user=user)
        .select_related("user", "user__city", "user__city__region")
        .first()
    )
    if profile:
        return profile, None

    if not is_driver_account(user):
        return None, {
            "status": status.HTTP_403_FORBIDDEN,
            "data": {
                "error": "This account is not a driver account.",
                "code": "not_driver_account",
            },
        }

    if not auto_create:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "data": {
                "error": "Driver profile not found.",
                "code": "driver_profile_missing",
            },
        }

    return get_or_create_driver_profile(user), None
