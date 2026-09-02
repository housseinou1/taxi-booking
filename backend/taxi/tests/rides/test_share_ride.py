"""Share Ride lifecycle, pricing, status, and object-level permission tests.

Share Ride uses three coordinated status systems (intentional, not a rename):
- Ride.STATUS_CHOICES — regular 1:1 ride lifecycle
- Ride.share_status (SHARE_PASSENGER_STATUS_CHOICES) — per-passenger in a session
- ShareRideSession.status (RideStatusService) — multi-passenger session machine
"""

from decimal import Decimal, ROUND_HALF_UP

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from app_settings.pricing_service import resolve_ride_fare
from locations.models import City, CityPricing, Region
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride, RidePricingSnapshot, ShareRideSession
from taxi.rides.models.ride import SHARE_PASSENGER_STATUS_CHOICES
from taxi.rides.services.pricing_engine import PricingEngine
from taxi.rides.services.ride_status_service import RideStatusService
from taxi.rides.share_views import DEFAULT_SIMILARITY_SCORE

User = get_user_model()

SHARE_REQUEST_URL = "/rides/share/request/"
LEGACY_HARDCODED_BASE = Decimal("50")
LEGACY_HARDCODED_PER_KM = Decimal("30")

NOUAKCHOTT = {
    "pickup": "Tevragh Zeina",
    "destination": "Nouakchott Airport",
    "pickup_lat": 18.0735,
    "pickup_lng": -15.9582,
    "destination_lat": 18.0896,
    "destination_lng": -15.9754,
}


def _client():
    return APIClient()


def _create_rider(email):
    user = User.objects.create_user(
        email=email,
        password="Pass1234!",
        first_name="Rider",
        last_name="Test",
        user_type="rider",
    )
    return user


def _create_driver(email, approved=True):
    user = User.objects.create_user(
        email=email,
        password="Pass1234!",
        first_name="Driver",
        last_name="Test",
        user_type="driver",
    )
    DriverProfile.objects.create(
        user=user,
        status="approved" if approved else "pending",
        is_available=True,
        vehicle_make="Toyota",
        vehicle_model="Corolla",
        vehicle_color="White",
        plate_number="NKC-100",
        current_lat=18.0735,
        current_lng=-15.9582,
    )
    return user


def _auth(client, user):
    client.force_authenticate(user=user)
    return client


def _share_payload(distance_km="5.00", seats=1, **overrides):
    payload = {
        **NOUAKCHOTT,
        "distance_km": distance_km,
        "seats": seats,
    }
    payload.update(overrides)
    return payload


def _expected_share_fares(city, distance_km, seats=1, similarity=DEFAULT_SIMILARITY_SCORE):
    result = resolve_ride_fare(city, "share", distance_km)
    base = result.estimated_fare.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fare = PricingEngine().calculate_share_fare(base, similarity, seats)
    return result, base, fare


def _request_share(client, user, **payload_overrides):
    _auth(client, user)
    response = client.post(SHARE_REQUEST_URL, _share_payload(**payload_overrides), format="json")
    return response


def _nearby_payload(suffix=0.002):
    """Slightly offset coords still within matching + service-area constraints."""
    return _share_payload(
        pickup_lat=NOUAKCHOTT["pickup_lat"] + suffix,
        pickup_lng=NOUAKCHOTT["pickup_lng"] + suffix,
        destination_lat=NOUAKCHOTT["destination_lat"] + suffix,
        destination_lng=NOUAKCHOTT["destination_lng"] + suffix,
        pickup="Tevragh Zeina North",
        destination="Airport Road",
    )


# ── Status system contracts ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_share_session_statuses_are_intentional_and_distinct_from_regular_rides():
    """Share session statuses must stay on the session; do not rename onto Ride."""
    session_statuses = {key for key, _ in ShareRideSession.STATUS_CHOICES}
    ride_statuses = {key for key, _ in Ride.STATUS_CHOICES}
    passenger_statuses = {key for key, _ in SHARE_PASSENGER_STATUS_CHOICES}

    assert set(RideStatusService.SHARE_RIDE_STATUSES) == session_statuses
    assert set(RideStatusService.VALID_TRANSITIONS) == session_statuses

    share_only = {
        "matching",
        "driver_assigned",
        "passenger_pickup",
        "additional_pickup",
        "drop_off_stop",
    }
    assert share_only.issubset(session_statuses)
    assert share_only.isdisjoint(ride_statuses)

    assert passenger_statuses == {
        "waiting_match",
        "matched",
        "waiting_pickup",
        "picked_up",
        "dropped_off",
        "cancelled",
    }
    # Regular rides keep driver_arrived / rider_no_show; session machine does not.
    assert "driver_arrived" in ride_statuses
    assert "driver_arrived" not in session_statuses
    assert "rider_no_show" in ride_statuses
    assert "rider_no_show" not in session_statuses


@pytest.mark.django_db
def test_invalid_session_transition_is_rejected():
    session = ShareRideSession.objects.create(status="matching")
    service = RideStatusService()
    assert service.transition(session, "in_progress") is False
    session.refresh_from_db()
    assert session.status == "matching"
    assert service.is_valid_transition("matching", "driver_assigned")
    assert not service.is_valid_transition("completed", "matching")


# ── Request / auth ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_unauthenticated_share_request_is_rejected():
    client = _client()
    response = client.post(SHARE_REQUEST_URL, _share_payload(), format="json")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_rider_creates_share_ride_request():
    client = _client()
    rider = _create_rider("share-create@test.com")
    response = _request_share(client, rider)
    assert response.status_code == 201, response.data
    assert response.data["ride_type"] == "Share"
    assert response.data["status"] == "requested"
    assert response.data["share_status"] == "waiting_match"
    assert response.data["session_id"]
    assert response.data["session_status"] == "matching"
    assert response.data["seats"] == 1
    assert response.data["fare"] > 0
    ride = Ride.objects.get(pk=response.data["id"])
    assert ride.rider_id == rider.id
    assert ride.share_session_id == response.data["session_id"]


@pytest.mark.django_db
def test_share_request_requires_fields_and_valid_seats():
    client = _client()
    rider = _create_rider("share-validate@test.com")
    _auth(client, rider)

    missing = client.post(SHARE_REQUEST_URL, {"pickup": "A"}, format="json")
    assert missing.status_code == 400

    bad_seats = client.post(SHARE_REQUEST_URL, _share_payload(seats=3), format="json")
    assert bad_seats.status_code == 400
    assert "Seat" in bad_seats.data["error"]

    outside = client.post(
        SHARE_REQUEST_URL,
        _share_payload(pickup_lat=20.0, pickup_lng=-15.95),
        format="json",
    )
    assert outside.status_code == 400
    assert "service area" in outside.data["error"].lower()


@pytest.mark.django_db
def test_cannot_request_second_open_share_ride():
    client = _client()
    rider = _create_rider("share-open@test.com")
    first = _request_share(client, rider)
    assert first.status_code == 201
    second = _request_share(client, rider)
    assert second.status_code == 400
    assert second.data["ride_id"] == first.data["id"]


# ── Fare consistency ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_share_fare_uses_canonical_config_not_hardcoded_50_30():
    client = _client()
    rider = _create_rider("share-fare-canonical@test.com")
    distance = Decimal("8.00")
    response = _request_share(client, rider, distance_km=str(distance))
    assert response.status_code == 201, response.data

    ride = Ride.objects.get(pk=response.data["id"])
    _, expected_base, expected_fare = _expected_share_fares(ride.city, distance, seats=1)

    legacy_base = (LEGACY_HARDCODED_BASE + LEGACY_HARDCODED_PER_KM * distance).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    assert ride.economy_fare == expected_base
    assert ride.fare == expected_fare
    assert ride.economy_fare != legacy_base
    assert ride.fare < ride.economy_fare
    assert response.data["savings"] == int(ride.economy_fare - ride.fare)

    snapshot = RidePricingSnapshot.objects.get(ride=ride)
    assert snapshot.ride_type == "share"
    assert snapshot.source in ("city", "global_db", "market_fallback")
    assert snapshot.estimated_fare == resolve_ride_fare(ride.city, "share", distance).estimated_fare


@pytest.mark.django_db
def test_city_pricing_change_updates_share_estimate_and_discount_still_applies():
    region = Region.objects.create(name="Share Fare Region")
    city = City.objects.create(name="Share Fare City", region=region, is_active=True)
    CityPricing.objects.create(
        city=city,
        ride_type="share",
        base_fare=Decimal("1000.00"),
        per_km=Decimal("100.00"),
        minimum_fare=Decimal("1000.00"),
        is_active=True,
    )
    rider = _create_rider("share-city-fare@test.com")
    distance = Decimal("5.00")
    response = _request_share(
        _client(), rider, distance_km=str(distance), city=city.id
    )
    assert response.status_code == 201, response.data

    result, expected_base, expected_fare = _expected_share_fares(city, distance, seats=1)
    assert result.source == "city"
    assert expected_base == Decimal("1500")
    assert response.data["economy_fare"] == int(expected_base)
    assert response.data["fare"] == int(expected_fare)
    assert expected_fare < expected_base
    # Discount at DEFAULT_SIMILARITY_SCORE (0.7) is 35% off canonical share base.
    assert expected_fare == Decimal("975")


@pytest.mark.django_db
def test_two_seats_multiplies_share_fare_after_discount():
    client = _client()
    rider = _create_rider("share-seats@test.com")
    distance = Decimal("4.00")
    response = _request_share(client, rider, distance_km=str(distance), seats=2)
    assert response.status_code == 201, response.data
    ride = Ride.objects.get(pk=response.data["id"])
    _, expected_base, expected_fare = _expected_share_fares(ride.city, distance, seats=2)
    one_seat = PricingEngine().calculate_share_fare(
        expected_base, DEFAULT_SIMILARITY_SCORE, seats=1
    )
    assert ride.seats == 2
    assert ride.economy_fare == expected_base
    assert ride.fare == expected_fare
    assert ride.fare > one_seat


# ── Matching / multi-rider ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_compatible_riders_join_the_same_session():
    client = _client()
    rider_a = _create_rider("share-match-a@test.com")
    rider_b = _create_rider("share-match-b@test.com")

    first = _request_share(client, rider_a)
    assert first.status_code == 201, first.data

    _auth(client, rider_b)
    second = client.post(SHARE_REQUEST_URL, _nearby_payload(), format="json")
    assert second.status_code == 201, second.data
    assert second.data["session_id"] == first.data["session_id"]
    assert second.data["passengers_count"] == 2
    assert "Rider" in second.data["other_passengers"]

    session = ShareRideSession.objects.get(pk=first.data["session_id"])
    assert session.passengers_count == 2
    assert session.active_rides.count() == 2


@pytest.mark.django_db
def test_distant_riders_do_not_match():
    client = _client()
    rider_a = _create_rider("share-far-a@test.com")
    rider_b = _create_rider("share-far-b@test.com")
    first = _request_share(client, rider_a)
    _auth(client, rider_b)
    second = client.post(
        SHARE_REQUEST_URL,
        _share_payload(
            pickup="Arafat",
            destination="Sebkha West",
            pickup_lat=18.15,
            pickup_lng=-15.85,
            destination_lat=18.18,
            destination_lng=-15.82,
        ),
        format="json",
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.data["session_id"] != first.data["session_id"]


@pytest.mark.django_db
def test_three_compatible_riders_share_one_session():
    client = _client()
    riders = [
        _create_rider(f"share-triple-{i}@test.com") for i in range(3)
    ]
    session_ids = []
    for i, rider in enumerate(riders):
        _auth(client, rider)
        payload = _nearby_payload(suffix=0.001 * i) if i else _share_payload()
        response = client.post(SHARE_REQUEST_URL, payload, format="json")
        assert response.status_code == 201, response.data
        session_ids.append(response.data["session_id"])
    assert len(set(session_ids)) == 1
    session = ShareRideSession.objects.get(pk=session_ids[0])
    assert session.passengers_count == 3


# ── Driver assignment and full lifecycle ──────────────────────────────────────


def _accept_session(client, driver, session_id):
    _auth(client, driver)
    return client.post(f"/rides/share/session/{session_id}/accept/", {}, format="json")


@pytest.mark.django_db
def test_full_share_lifecycle_single_rider():
    client = _client()
    rider = _create_rider("share-life-rider@test.com")
    driver = _create_driver("share-life-driver@test.com")

    created = _request_share(client, rider)
    assert created.status_code == 201
    ride_id = created.data["id"]
    session_id = created.data["session_id"]

    accepted = _accept_session(client, driver, session_id)
    assert accepted.status_code == 200, accepted.data
    assert accepted.data["status"] == "driver_arriving"
    ride = Ride.objects.get(pk=ride_id)
    assert ride.driver_id == driver.id
    assert ride.share_status == "waiting_pickup"

    _auth(client, driver)
    picked = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    assert picked.status_code == 200, picked.data
    assert picked.data["share_status"] == "picked_up"
    ride.refresh_from_db()
    assert ride.status == "in_progress"
    session = ShareRideSession.objects.get(pk=session_id)
    assert session.status == "in_progress"

    dropped = client.post(
        f"/rides/share/session/{session_id}/dropoff/",
        {"ride_id": ride_id},
        format="json",
    )
    assert dropped.status_code == 200, dropped.data
    assert dropped.data["share_status"] == "dropped_off"
    ride.refresh_from_db()
    assert ride.status == "completed"
    session.refresh_from_db()
    assert session.status == "drop_off_stop"

    completed = client.post(
        f"/rides/share/session/{session_id}/complete/",
        {},
        format="json",
    )
    assert completed.status_code == 200, completed.data
    session.refresh_from_db()
    assert session.status == "completed"
    assert completed.data["driver_earnings"] == int(session.driver_earnings)
    assert session.driver_earnings == session.total_fare - session.platform_commission
    assert session.total_fare == ride.fare


@pytest.mark.django_db
def test_full_share_lifecycle_two_riders_and_completion_earnings():
    client = _client()
    rider_a = _create_rider("share-two-a@test.com")
    rider_b = _create_rider("share-two-b@test.com")
    driver = _create_driver("share-two-driver@test.com")

    first = _request_share(client, rider_a)
    _auth(client, rider_b)
    second = client.post(SHARE_REQUEST_URL, _nearby_payload(), format="json")
    assert first.status_code == 201
    assert second.status_code == 201
    session_id = first.data["session_id"]
    ride_a_id = first.data["id"]
    ride_b_id = second.data["id"]

    accepted = _accept_session(client, driver, session_id)
    assert accepted.status_code == 200
    assert accepted.data["passengers_count"] == 2

    _auth(client, driver)
    first_pickup = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_a_id},
        format="json",
    )
    assert first_pickup.status_code == 200
    session = ShareRideSession.objects.get(pk=session_id)
    assert session.status == "passenger_pickup"

    second_pickup = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_b_id},
        format="json",
    )
    assert second_pickup.status_code == 200
    session.refresh_from_db()
    assert session.status == "in_progress"

    for ride_id in (ride_a_id, ride_b_id):
        drop = client.post(
            f"/rides/share/session/{session_id}/dropoff/",
            {"ride_id": ride_id},
            format="json",
        )
        assert drop.status_code == 200, drop.data

    complete = client.post(f"/rides/share/session/{session_id}/complete/", {}, format="json")
    assert complete.status_code == 200, complete.data
    session.refresh_from_db()
    assert session.status == "completed"
    assert complete.data["passengers_count"] == 2
    ride_a = Ride.objects.get(pk=ride_a_id)
    ride_b = Ride.objects.get(pk=ride_b_id)
    assert ride_a.share_status == "dropped_off"
    assert ride_b.share_status == "dropped_off"
    expected_total = ride_a.fare + ride_b.fare
    assert session.total_fare == expected_total
    assert complete.data["total_fare"] == int(expected_total)


@pytest.mark.django_db
def test_driver_cannot_accept_session_not_in_matching():
    client = _client()
    rider = _create_rider("share-reaccept-r@test.com")
    driver = _create_driver("share-reaccept-d@test.com")
    created = _request_share(client, rider)
    session_id = created.data["session_id"]
    first = _accept_session(client, driver, session_id)
    assert first.status_code == 200
    second = _accept_session(client, driver, session_id)
    assert second.status_code == 400
    assert "Cannot accept" in second.data["error"]


@pytest.mark.django_db
def test_invalid_pickup_dropoff_and_complete_transitions():
    client = _client()
    rider = _create_rider("share-bad-tx-r@test.com")
    driver = _create_driver("share-bad-tx-d@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    session_id = created.data["session_id"]
    _accept_session(client, driver, session_id)
    _auth(client, driver)

    drop_early = client.post(
        f"/rides/share/session/{session_id}/dropoff/",
        {"ride_id": ride_id},
        format="json",
    )
    assert drop_early.status_code == 400

    complete_early = client.post(
        f"/rides/share/session/{session_id}/complete/",
        {},
        format="json",
    )
    assert complete_early.status_code == 400

    client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    pickup_again = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    assert pickup_again.status_code == 400


# ── Cancellation ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_free_cancel_while_matching():
    client = _client()
    rider = _create_rider("share-cancel-free@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    _auth(client, rider)
    cancelled = client.post(f"/rides/share/{ride_id}/cancel/", {}, format="json")
    assert cancelled.status_code == 200, cancelled.data
    assert cancelled.data["cancellation_fee"] == 0
    ride = Ride.objects.get(pk=ride_id)
    assert ride.status == "cancelled"
    assert ride.share_status == "cancelled"
    session = ShareRideSession.objects.get(pk=created.data["session_id"])
    assert session.status == "cancelled"


@pytest.mark.django_db
def test_cancel_after_driver_accept_charges_fee():
    client = _client()
    rider = _create_rider("share-cancel-fee-r@test.com")
    driver = _create_driver("share-cancel-fee-d@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    _accept_session(client, driver, created.data["session_id"])
    _auth(client, rider)
    cancelled = client.post(f"/rides/share/{ride_id}/cancel/", {}, format="json")
    assert cancelled.status_code == 200, cancelled.data
    ride = Ride.objects.get(pk=ride_id)
    expected_fee = (ride.fare * Decimal("0.20")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    # fare is already cancelled; use response
    assert cancelled.data["cancellation_fee"] == int(expected_fee)
    assert ride.status == "cancelled"


@pytest.mark.django_db
def test_cannot_cancel_after_pickup_started():
    client = _client()
    rider = _create_rider("share-cancel-late-r@test.com")
    driver = _create_driver("share-cancel-late-d@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    session_id = created.data["session_id"]
    _accept_session(client, driver, session_id)
    _auth(client, driver)
    client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    _auth(client, rider)
    cancelled = client.post(f"/rides/share/{ride_id}/cancel/", {}, format="json")
    assert cancelled.status_code == 400
    Ride.objects.get(pk=ride_id).refresh_from_db()
    ride = Ride.objects.get(pk=ride_id)
    assert ride.status == "in_progress"


# ── Permissions ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_rider_cannot_view_or_cancel_another_riders_share_ride():
    client = _client()
    owner = _create_rider("share-idor-owner@test.com")
    other = _create_rider("share-idor-other@test.com")
    created = _request_share(client, owner)
    ride_id = created.data["id"]

    _auth(client, other)
    detail = client.get(f"/rides/share/{ride_id}/")
    assert detail.status_code == 403

    cancel = client.post(f"/rides/share/{ride_id}/cancel/", {}, format="json")
    assert cancel.status_code == 404

    rate = client.post(
        f"/rides/share/{ride_id}/rate/",
        {"rating": 5},
        format="json",
    )
    assert rate.status_code == 404


@pytest.mark.django_db
def test_unassigned_driver_cannot_mutate_session():
    client = _client()
    rider = _create_rider("share-idor-r@test.com")
    assigned = _create_driver("share-idor-assigned@test.com")
    other = _create_driver("share-idor-other-d@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    session_id = created.data["session_id"]
    _accept_session(client, assigned, session_id)

    _auth(client, other)
    pickup = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    assert pickup.status_code == 404

    dropoff = client.post(
        f"/rides/share/session/{session_id}/dropoff/",
        {"ride_id": ride_id},
        format="json",
    )
    assert dropoff.status_code == 404

    complete = client.post(
        f"/rides/share/session/{session_id}/complete/",
        {},
        format="json",
    )
    assert complete.status_code == 404

    stops = client.get(f"/rides/share/session/{session_id}/stops/")
    assert stops.status_code == 403


@pytest.mark.django_db
def test_rider_cannot_accept_session_or_change_share_status():
    client = _client()
    rider = _create_rider("share-rider-accept@test.com")
    created = _request_share(client, rider)
    session_id = created.data["session_id"]
    ride_id = created.data["id"]
    _auth(client, rider)

    accept = client.post(f"/rides/share/session/{session_id}/accept/", {}, format="json")
    assert accept.status_code == 403

    pickup = client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    assert pickup.status_code == 404


@pytest.mark.django_db
def test_unauthenticated_cannot_change_share_status():
    client = _client()
    rider = _create_rider("share-anon-r@test.com")
    driver = _create_driver("share-anon-d@test.com")
    created = _request_share(client, rider)
    session_id = created.data["session_id"]
    _accept_session(client, driver, session_id)

    client.force_authenticate(user=None)
    ride_id = created.data["id"]
    for url, body in (
        (f"/rides/share/{ride_id}/cancel/", {}),
        (f"/rides/share/session/{session_id}/pickup/", {"ride_id": ride_id}),
        (f"/rides/share/session/{session_id}/complete/", {}),
    ):
        response = client.post(url, body, format="json")
        assert response.status_code in (401, 403), url


@pytest.mark.django_db
def test_assigned_driver_can_view_stops_and_unapproved_driver_cannot_accept():
    client = _client()
    rider = _create_rider("share-stops-r@test.com")
    driver = _create_driver("share-stops-d@test.com")
    pending = _create_driver("share-pending-d@test.com", approved=False)
    created = _request_share(client, rider)
    session_id = created.data["session_id"]

    denied = _accept_session(client, pending, session_id)
    assert denied.status_code == 403

    accepted = _accept_session(client, driver, session_id)
    assert accepted.status_code == 200
    _auth(client, driver)
    stops = client.get(f"/rides/share/session/{session_id}/stops/")
    assert stops.status_code == 200
    assert stops.data["session_id"] == session_id
    assert len(stops.data["stops"]) >= 2


@pytest.mark.django_db
def test_admin_share_analytics_allowed_for_staff_only():
    client = _client()
    rider = _create_rider("share-admin-r@test.com")
    _auth(client, rider)
    forbidden = client.get("/api/admin/share/analytics/")
    assert forbidden.status_code == 403

    admin = User.objects.create_superuser(
        email="share-admin@test.com",
        password="Pass1234!",
        first_name="Admin",
        last_name="Test",
    )
    _auth(client, admin)
    allowed = client.get("/api/admin/share/analytics/")
    assert allowed.status_code == 200
    for key in (
        "total_rides",
        "total_savings",
        "platform_revenue",
        "avg_occupancy",
        "driver_earnings",
        "route_efficiency",
    ):
        assert key in allowed.data


@pytest.mark.django_db
def test_rider_can_rate_completed_share_ride_only():
    client = _client()
    rider = _create_rider("share-rate-r@test.com")
    driver = _create_driver("share-rate-d@test.com")
    created = _request_share(client, rider)
    ride_id = created.data["id"]
    session_id = created.data["session_id"]

    _auth(client, rider)
    too_early = client.post(
        f"/rides/share/{ride_id}/rate/",
        {"rating": 5},
        format="json",
    )
    assert too_early.status_code == 400

    _accept_session(client, driver, session_id)
    _auth(client, driver)
    client.post(
        f"/rides/share/session/{session_id}/pickup/",
        {"ride_id": ride_id},
        format="json",
    )
    client.post(
        f"/rides/share/session/{session_id}/dropoff/",
        {"ride_id": ride_id},
        format="json",
    )

    _auth(client, rider)
    rated = client.post(
        f"/rides/share/{ride_id}/rate/",
        {"rating": 5, "review": "Great share ride"},
        format="json",
    )
    assert rated.status_code == 200, rated.data
    duplicate = client.post(
        f"/rides/share/{ride_id}/rate/",
        {"rating": 4},
        format="json",
    )
    assert duplicate.status_code == 400


@pytest.mark.django_db
def test_matching_does_not_reprice_when_fare_already_set():
    """Current: create_session skips fare recalc if ride.fare is already set.

    Intended (not implemented here): reprice using session.route_similarity_score
    after a match. This test documents current behavior so a later change is explicit.
    """
    client = _client()
    rider_a = _create_rider("share-reprice-a@test.com")
    rider_b = _create_rider("share-reprice-b@test.com")
    first = _request_share(client, rider_a)
    original_fare = Decimal(str(first.data["fare"]))
    _auth(client, rider_b)
    client.post(SHARE_REQUEST_URL, _nearby_payload(), format="json")
    ride_a = Ride.objects.get(pk=first.data["id"])
    assert ride_a.fare == original_fare
    session = ride_a.share_session
    intended = PricingEngine().calculate_share_fare(
        ride_a.economy_fare,
        session.route_similarity_score,
        ride_a.seats,
    )
    # May already equal original when similarity stays near 0.7; still assert current fare.
    assert ride_a.fare == original_fare
    assert intended > 0
