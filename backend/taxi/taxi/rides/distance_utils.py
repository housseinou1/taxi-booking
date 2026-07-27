import re
from decimal import Decimal, InvalidOperation

from taxi.rides.services.driver_dispatch_service import haversine_km


_METER_UNITS = ("m", "meter", "meters", "metre", "metres")
_KM_UNITS = ("km", "kilometer", "kilometers", "kilometre", "kilometres")


def _to_float(value):
    try:
        if isinstance(value, str):
            value = value.replace(",", ".").strip()
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_present(request_data, *keys):
    for key in keys:
        value = request_data.get(key)
        if value not in (None, ""):
            return value
    return None


def _parse_distance_km(value):
    """
    Extract a numeric distance in kilometres from common string/number forms.
    Handles values such as "5.3", "5,3", "5.3 km", "5300 m", 5.3 and 5300.
    """
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))

    text = str(value).strip().lower().replace(",", ".")
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None

    number = match.group(1)
    try:
        parsed = Decimal(number)
    except InvalidOperation:
        return None

    unit = re.sub(r"[\d\s.]", "", text)
    if any(u in unit for u in _KM_UNITS):
        return parsed
    if any(u in unit for u in _METER_UNITS):
        return parsed / Decimal("1000")
    return parsed


def resolve_ride_distance_km(request_data):
    """
    Resolve ride distance from request payload.
    Prefer client-supplied distance, then compute from coordinates + stops.
    """
    client_km = _parse_distance_km(
        _first_present(request_data, "distance_km", "distance", "estimated_distance_km")
    )
    if client_km is not None:
        if Decimal("0") < client_km < Decimal("0.1"):
            return Decimal("0.1")
        if Decimal("0.1") <= client_km <= Decimal("200"):
            return client_km

    client_m = _parse_distance_km(
        _first_present(request_data, "distance_meters", "distance_in_meters", "estimated_distance_meters")
    )
    if client_m is not None:
        client_km = client_m / Decimal("1000")
        if Decimal("0") < client_km < Decimal("0.1"):
            return Decimal("0.1")
        if Decimal("0.1") <= client_km <= Decimal("200"):
            return client_km

    pickup_lat = _to_float(
        _first_present(
            request_data,
            "pickup_lat",
            "pickup_latitude",
            "pickupLatitude",
            "pickupLat",
        )
    )
    pickup_lng = _to_float(
        _first_present(
            request_data,
            "pickup_lng",
            "pickup_longitude",
            "pickupLongitude",
            "pickupLng",
        )
    )
    destination_lat = _to_float(
        _first_present(
            request_data,
            "destination_lat",
            "destination_latitude",
            "destinationLatitude",
            "destinationLat",
        )
    )
    destination_lng = _to_float(
        _first_present(
            request_data,
            "destination_lng",
            "destination_longitude",
            "destinationLongitude",
            "destinationLng",
        )
    )

    points = []
    if pickup_lat is not None and pickup_lng is not None:
        points.append((pickup_lat, pickup_lng))

    for stop in request_data.get("stops") or []:
        lat = _to_float(
            _first_present(stop, "latitude", "lat", "Latitude", "Lat")
        )
        lng = _to_float(
            _first_present(stop, "longitude", "lng", "Longitude", "Lng")
        )
        if lat is not None and lng is not None:
            points.append((lat, lng))

    if destination_lat is not None and destination_lng is not None:
        points.append((destination_lat, destination_lng))

    if len(points) < 2:
        raise ValueError("Ride distance must be between 0.1 and 200 km.")

    total_km = 0.0
    for index in range(1, len(points)):
        total_km += haversine_km(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1])

    computed = Decimal(str(max(0.1, round(total_km, 2))))
    if computed > Decimal("200"):
        raise ValueError("Ride distance must be between 0.1 and 200 km.")
    return computed
