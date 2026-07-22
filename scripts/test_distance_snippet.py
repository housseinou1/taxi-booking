from taxi.rides.distance_utils import resolve_ride_distance_km
payload = {
    "distance_km": 0,
    "pickup_lat": 18.0735,
    "pickup_lng": -15.9582,
    "destination_lat": 18.0896,
    "destination_lng": -15.9754,
}
print(resolve_ride_distance_km(payload))
