from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import Region, City


def serialize_city(city):
    return {
        "id": city.id,
        "name": city.name,
        "name_ar": city.name_ar,
        "name_fr": city.name_fr,
        "region": city.region.name,
        "region_id": city.region_id,
        "latitude": city.latitude,
        "longitude": city.longitude,
        "is_active": city.is_active,
        "base_price_regular": float(city.base_price_regular) if city.base_price_regular else None,
        "per_km_regular": float(city.per_km_regular) if city.per_km_regular else None,
    }


def serialize_region(region):
    return {
        "id": region.id,
        "name": region.name,
        "name_ar": region.name_ar,
        "name_fr": region.name_fr,
        "is_active": region.is_active,
        "cities": [serialize_city(c) for c in region.cities.filter(is_active=True)],
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def list_cities(request):
    """Public list of all active cities grouped by region."""
    regions = Region.objects.filter(is_active=True).prefetch_related("cities")
    return Response([serialize_region(r) for r in regions])


@api_view(["GET"])
@permission_classes([AllowAny])
def city_detail(request, city_id):
    """Get single city details."""
    try:
        city = City.objects.select_related("region").get(id=city_id)
    except City.DoesNotExist:
        return Response({"error": "City not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(serialize_city(city))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_city(request):
    """Admin: create a new city."""
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=status.HTTP_403_FORBIDDEN)

    region_name = request.data.get("region", "")
    city_name = request.data.get("name", "")
    if not region_name or not city_name:
        return Response({"error": "region and name required"}, status=status.HTTP_400_BAD_REQUEST)

    region, _ = Region.objects.get_or_create(name=region_name, defaults={"name_fr": region_name, "name_ar": ""})
    city, created = City.objects.get_or_create(
        region=region, name=city_name,
        defaults={
            "name_fr": request.data.get("name_fr", city_name),
            "name_ar": request.data.get("name_ar", ""),
            "latitude": request.data.get("latitude", 0),
            "longitude": request.data.get("longitude", 0),
        }
    )
    return Response(serialize_city(city), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_city(request, city_id):
    """Admin: update city details/pricing."""
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=status.HTTP_403_FORBIDDEN)
    try:
        city = City.objects.get(id=city_id)
    except City.DoesNotExist:
        return Response({"error": "City not found"}, status=status.HTTP_404_NOT_FOUND)

    for field in ["name", "name_ar", "name_fr", "latitude", "longitude", "is_active",
                  "base_price_regular", "per_km_regular", "base_price_xl", "per_km_xl",
                  "base_price_comfort", "per_km_comfort"]:
        if field in request.data:
            setattr(city, field, request.data[field])
    city.save()
    return Response(serialize_city(city))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def city_analytics(request, city_id):
    """Admin: analytics for a specific city."""
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=status.HTTP_403_FORBIDDEN)
    try:
        city = City.objects.get(id=city_id)
    except City.DoesNotExist:
        return Response({"error": "City not found"}, status=status.HTTP_404_NOT_FOUND)

    from django.contrib.auth import get_user_model
    from taxi.rides.models import Ride
    from taxi.drivers.models import DriverProfile
    from django.db.models import Sum, Count

    User = get_user_model()

    rides = Ride.objects.filter(city=city)
    completed = rides.filter(status="completed")

    return Response({
        "city": serialize_city(city),
        "total_rides": rides.count(),
        "completed_rides": completed.count(),
        "total_revenue": float(completed.aggregate(t=Sum("fare"))["t"] or 0),
        "total_commission": float(completed.aggregate(t=Sum("app_fee"))["t"] or 0),
        "active_drivers": DriverProfile.objects.filter(user__city=city, is_available=True).count(),
        "total_riders": User.objects.filter(city=city, user_type="rider").count(),
        "total_drivers": DriverProfile.objects.filter(user__city=city).count(),
    })
