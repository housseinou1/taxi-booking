from taxi.market import MARKET
from taxi.rides.distance_utils import resolve_ride_distance_km
from taxi.security.abuse import validate_coordinates

request_data = {
    "distance_km": 0,
    "destination_lat": 18.0896,
    "destination_lng": -15.9754,
}

pickup_lat, pickup_lng = validate_coordinates(
    request_data.get("pickup_lat", MARKET["default_pickup_lat"]),
    request_data.get("pickup_lng", MARKET["default_pickup_lng"]),
)
destination_lat, destination_lng = validate_coordinates(
    request_data.get("destination_lat", MARKET["default_destination_lat"]),
    request_data.get("destination_lng", MARKET["default_destination_lng"]),
)
resolved_request_data = {
    **request_data,
    "pickup_lat": pickup_lat,
    "pickup_lng": pickup_lng,
    "destination_lat": destination_lat,
    "destination_lng": destination_lng,
}
print(resolve_ride_distance_km(resolved_request_data))
