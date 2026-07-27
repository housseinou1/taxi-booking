from decimal import Decimal

import pytest

from taxi.rides.distance_utils import resolve_ride_distance_km


def test_resolve_ride_distance_km_uses_client_value():
    payload = {"distance_km": "4.2", "pickup_lat": 18.07, "pickup_lng": -15.95}
    assert resolve_ride_distance_km(payload) == Decimal("4.2")


def test_resolve_ride_distance_km_computes_from_coordinates_when_missing():
    payload = {
        "distance_km": 0,
        "pickup_lat": 18.0735,
        "pickup_lng": -15.9582,
        "destination_lat": 18.0896,
        "destination_lng": -15.9754,
    }
    resolved = resolve_ride_distance_km(payload)
    assert resolved >= Decimal("0.1")
    assert resolved <= Decimal("200")


def test_resolve_ride_distance_km_accepts_frontend_coordinate_aliases():
    payload = {
        "distance_km": 0,
        "pickup_latitude": 18.0735,
        "pickup_longitude": -15.9582,
        "destination_latitude": 18.0896,
        "destination_longitude": -15.9754,
    }
    resolved = resolve_ride_distance_km(payload)
    assert resolved >= Decimal("0.1")
    assert resolved <= Decimal("200")


def test_resolve_ride_distance_km_clamps_tiny_positive_client_value():
    payload = {"distance_km": "0.01"}
    assert resolve_ride_distance_km(payload) == Decimal("0.1")


def test_resolve_ride_distance_km_uses_validated_coordinates_when_request_missing_pickup():
    payload = {
        "distance_km": 0,
        "destination_lat": 18.0896,
        "destination_lng": -15.9754,
        "pickup_lat": 18.0735,
        "pickup_lng": -15.9582,
    }
    resolved = resolve_ride_distance_km(payload)
    assert resolved >= Decimal("0.1")


def test_resolve_ride_distance_km_includes_stops():
    payload = {
        "distance": "0",
        "pickup_lat": 18.0735,
        "pickup_lng": -15.9582,
        "stops": [{"latitude": 18.1002, "longitude": -15.9631}],
        "destination_lat": 18.0896,
        "destination_lng": -15.9754,
    }
    resolved = resolve_ride_distance_km(payload)
    assert resolved >= Decimal("0.1")


def test_resolve_ride_distance_km_accepts_distance_unit_string():
    assert resolve_ride_distance_km({"distance": "5.3 km"}) == Decimal("5.3")


def test_resolve_ride_distance_km_accepts_comma_decimal():
    assert resolve_ride_distance_km({"distance_km": "5,3"}) == Decimal("5.3")


def test_resolve_ride_distance_km_accepts_distance_meters():
    assert resolve_ride_distance_km({"distance_meters": "5300"}) == Decimal("5.3")


def test_resolve_ride_distance_km_accepts_camelcase_coordinates():
    payload = {
        "distance": 0,
        "pickupLatitude": 18.0735,
        "pickupLongitude": -15.9582,
        "destinationLatitude": 18.0896,
        "destinationLongitude": -15.9754,
    }
    resolved = resolve_ride_distance_km(payload)
    assert resolved >= Decimal("0.1")
    assert resolved <= Decimal("200")
