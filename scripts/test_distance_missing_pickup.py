from taxi.rides.distance_utils import resolve_ride_distance_km
from taxi.market import MARKET

payload = {
    "distance_km": 0,
    "destination_lat": 18.0896,
    "destination_lng": -15.9754,
}
try:
    print("ONLY_DEST", resolve_ride_distance_km(payload))
except Exception as exc:
    print("ONLY_DEST_ERROR", exc)

merged = {
    **payload,
    "pickup_lat": MARKET["default_pickup_lat"],
    "pickup_lng": MARKET["default_pickup_lng"],
}
print("MERGED", resolve_ride_distance_km(merged))
