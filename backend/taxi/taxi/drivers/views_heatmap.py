"""
Heatmap and Favorite Areas API Views

Provides endpoints for:
- GET /drivers/heatmap/ - Active heatmap zones
- GET /drivers/me/favorites/ - List driver's favorite areas
- POST /drivers/me/favorites/ - Add a favorite area (max 5)
- DELETE /drivers/me/favorites/{id}/ - Remove a favorite area

Requirements: 1.6, 13.3, 13.4
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile, DriverFavoriteArea, HeatmapZone
from .api.serializers import DriverFavoriteAreaSerializer, HeatmapZoneSerializer


class HeatmapView(APIView):
    """
    GET /drivers/heatmap/

    Returns all active heatmap zones with their intensity and location data.
    Used by the driver dashboard to display busy zone overlays on the map.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        zones = HeatmapZone.objects.filter(active=True)
        serializer = HeatmapZoneSerializer(zones, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class DriverFavoriteAreaListView(APIView):
    """
    GET /drivers/me/favorites/
    POST /drivers/me/favorites/

    List or create favorite areas for the authenticated driver.
    Maximum 5 favorite areas per driver.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        favorites = DriverFavoriteArea.objects.filter(driver=profile).order_by(
            "-created_at"
        )
        serializer = DriverFavoriteAreaSerializer(favorites, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Enforce max 5 favorite areas
        current_count = DriverFavoriteArea.objects.filter(driver=profile).count()
        if current_count >= 5:
            return Response(
                {"error": "Maximum 5 favorite areas. Remove one first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DriverFavoriteAreaSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save(driver=profile)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DriverFavoriteAreaDeleteView(APIView):
    """
    DELETE /drivers/me/favorites/{id}/

    Remove a favorite area belonging to the authenticated driver.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, favorite_id):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            favorite = DriverFavoriteArea.objects.get(
                id=favorite_id, driver=profile
            )
        except DriverFavoriteArea.DoesNotExist:
            return Response(
                {"error": "Favorite area not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        favorite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
