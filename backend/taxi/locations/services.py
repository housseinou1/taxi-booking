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
    """Return the resolved estimated fare as a Decimal."""
    from app_settings.pricing_service import resolve_ride_fare

    result = resolve_ride_fare(city, ride_type, distance_km)
    return result.estimated_fare


def _resolve_user_city(city):
    """Translate the caller's ``locations.City`` into the ``cities.City`` that ``User.city`` uses.

    ``User.city`` is a ForeignKey to ``cities.City``, while the locations hierarchy (and
    ``Ride.city``) use ``locations.City``. These are two distinct models, so passing the
    wrong type raised ``ValueError: Cannot query ...: Must be "City" instance`` and made
    this endpoint return HTTP 500. The equivalent record is therefore looked up by name.
    Returns ``None`` when no matching city exists.
    """
    if city is None:
        return None
    from cities.models import City as CitiesCity

    if isinstance(city, CitiesCity):
        return city
    name = getattr(city, "name", None) or str(city)
    return CitiesCity.objects.filter(name__iexact=name).first()


def city_analytics(city=None):
    from django.contrib.auth import get_user_model
    from taxi.drivers.models import DriverProfile
    from taxi.rides.models import Ride

    User = get_user_model()

    if city is None:
        ride_filter = {}
        user_filter = {}
    else:
        ride_filter = {"city": city}
        user_city = _resolve_user_city(city)
        # No matching cities.City: report zeros rather than silently counting every user.
        user_filter = {"city": user_city} if user_city is not None else None

    rides = Ride.objects.filter(**ride_filter)
    completed = rides.filter(status="completed")

    if user_filter is None:
        active_driver_users = User.objects.none()
        active_riders = 0
    else:
        active_driver_users = User.objects.filter(**user_filter)
        active_riders = User.objects.filter(
            **user_filter,
            user_type="rider",
            is_active=True,
        ).count()

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
        "active_riders": active_riders,
    }
