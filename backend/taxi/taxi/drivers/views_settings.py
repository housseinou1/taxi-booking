"""
Settings API Views

Provides endpoints for driver settings management:
- GET /drivers/me/settings/ - Retrieve current driver settings
- PATCH /drivers/me/settings/ - Update driver settings (partial update)

Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile, DriverSettings
from .api.serializers import DriverSettingsSerializer


class DriverSettingsView(APIView):
    """
    GET /drivers/me/settings/
    Returns the authenticated driver's current settings.
    Creates default settings if none exist.

    PATCH /drivers/me/settings/
    Partially updates the driver's settings.
    Validates:
    - language must be one of: en, fr, ar
    - pin_lock must be 4-6 numeric digits (or empty to clear)
    - gps_accuracy must be one of: high, battery_saver
    """

    permission_classes = [IsAuthenticated]

    def get_driver_settings(self, user):
        """Get or create driver settings for the authenticated user."""
        try:
            profile = user.driver_profile
        except DriverProfile.DoesNotExist:
            return None, Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        settings_obj, _ = DriverSettings.objects.get_or_create(driver=profile)
        return settings_obj, None

    def get(self, request):
        settings_obj, error_response = self.get_driver_settings(request.user)
        if error_response:
            return error_response

        serializer = DriverSettingsSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        settings_obj, error_response = self.get_driver_settings(request.user)
        if error_response:
            return error_response

        serializer = DriverSettingsSerializer(
            settings_obj,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
