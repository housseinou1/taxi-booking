from decimal import Decimal

from django.db.models import Count, Sum

from taxi.market import calculate_fare

from .models import City, CityPricing


def default_city():
    city = City.objects.filter(is_default=True, is_active=True).first()
    if city:
        return city
    return City.objects.filter(name__iexact="Nouakchott").first() or City.objects.filter(is_active=True).first()


def resolve_city(city_id=None, city_slug=None, fallback_user=None):
    city = None
    if city_id:
        city = City.objects.filter(id=city_id, is_active=True).first()
    if not city and city_slug:
        city = City.objects.filter(slug=city_slug, is_active=True).first()
    if not city and fallback_user is not None:
        user_city = getattr(fallback_user, "city", None)
        city = user_city if isinstance(user_city, City) else None
    return city or default_city()


def calculate_city_fare(city, ride_type, distance_km):
    """Return the resolved estimated fare as a Decimal.

    Delegates to the centralized resolver which follows the approved order:
    1. Active CityPricing override
    2. Active GlobalFareConfig
    3. market.py fallback
    """
    from app_settings.pricing_service import resolve_ride_fare

    result = resolve_ride_fare(city, ride_type, distance_km)
    return result.estimated_fare


def city_analytics(city=None):
    from django.contrib.auth import get_user_model
    from taxi.drivers.models import DriverProfile
    from taxi.rides.models import Ride

    User = get_user_model()
    city_filter = {"city": city} if city else {}
    ride_filter = {"city": city} if city else {}

    rides = Ride.objects.filter(**ride_filter)
    completed = rides.filter(status="completed")
    active_driver_users = User.objects.filter(city=city) if city else User.objects.all()

    return {
        "rides": rides.count(),
        "completed_rides": completed.count(),
        "cancelled_rides": rides.filter(status="cancelled").count(),
        "revenue": float(completed.aggregate(total=Sum("fare"))["total"] or 0),
        "active_drivers": DriverProfile.objects.filter(
            user__in=active_driver_users,
            status="approved",
            is_available=True,
        ).count(),
        "active_riders": User.objects.filter(
            **city_filter,
            user_type="rider",
            is_active=True,
        ).count(),
    }
