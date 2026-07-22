from decimal import Decimal

from taxi.rides.services.driver_dispatch_service import haversine_km


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_present(request_data, *keys):
    for key in keys:
        value = request_data.get(key)
        if value not in (None, ""):
            return value
    return None


def resolve_ride_distance_km(request_data):
    """
    Resolve ride distance from request payload.
    Prefer client-supplied distance, then compute from coordinates + stops.
    """
    raw_distance = request_data.get("distance_km", request_data.get("distance", 0))
    try:
        distance_km = Decimal(str(raw_distance or 0))
    except Exception:
        distance_km = Decimal("0")

    if Decimal("0") < distance_km < Decimal("0.1"):
        return Decimal("0.1")
    if Decimal("0.1") <= distance_km <= Decimal("200"):
        return distance_km

    pickup_lat = _to_float(_first_present(request_data, "pickup_lat", "pickup_latitude"))
    pickup_lng = _to_float(_first_present(request_data, "pickup_lng", "pickup_longitude"))
    destination_lat = _to_float(
        _first_present(request_data, "destination_lat", "destination_latitude")
    )
    destination_lng = _to_float(
        _first_present(request_data, "destination_lng", "destination_longitude")
    )

    points = []
    if pickup_lat is not None and pickup_lng is not None:
        points.append((pickup_lat, pickup_lng))

    for stop in request_data.get("stops") or []:
        lat = _to_float(stop.get("latitude", stop.get("lat")))
        lng = _to_float(stop.get("longitude", stop.get("lng")))
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
