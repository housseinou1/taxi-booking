"""STEP 8 — Smart driver dispatch matching tests."""

from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.rides.models import DispatchOfferLog, Ride
from taxi.rides.services.driver_dispatch_service import (
    rank_eligible_drivers,
    select_best_driver,
    vehicle_matches,
)
from taxi.rides.services.ride_assignment_service import (
    handle_driver_decline,
    offer_ride_to_next_driver,
)


def _make_driver(email, *, lat, lng, car_type="regular", **extra):
    user = User.objects.create_user(
        email=email,
        password="StrongPass123",
        user_type="driver",
        phone_verified_at=timezone.now(),
    )
    code = str(abs(hash(email)) % 900000 + 100000)
    profile = DriverProfile.objects.create(
        user=user,
        status="approved",
        driver_code=code,
        qr_code_uuid=f"00000000-0000-4000-8000-{code.zfill(12)}",
        is_available=True,
        available_since=timezone.now() - timezone.timedelta(minutes=extra.pop("waiting_min", 5)),
        current_lat=lat,
        current_lng=lng,
        car_type=car_type,
        average_rating=extra.pop("rating", 4.5),
        acceptance_rate_points=extra.pop("acceptance", 100),
        total_rides_received=extra.pop("received", 0),
        **extra,
    )
    return user, profile


class VehicleMatchTests(TestCase):
    def test_regular_accepts_comfort_and_xl(self):
        self.assertTrue(vehicle_matches("Regular", "regular"))
        self.assertTrue(vehicle_matches("Regular", "comfort"))
        self.assertTrue(vehicle_matches("XL", "xl"))
        self.assertFalse(vehicle_matches("XL", "regular"))
        self.assertFalse(vehicle_matches("Comfort", "regular"))


@override_settings(
    YALA_SERVICE_AREA_BOUNDS={
        "min_lat": 17.75,
        "max_lat": 18.40,
        "min_lng": -16.35,
        "max_lng": -15.65,
    }
)
class SmartDispatchMatchingTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="dispatch-rider@example.com",
            password="StrongPass123",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Centre",
            status="requested",
            ride_type="Regular",
            pickup_lat=18.1000,
            pickup_lng=-15.9800,
        )

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_nearest_eligible_driver_selected(self, _docs):
        near_user, _ = _make_driver(
            "near@example.com", lat=18.1010, lng=-15.9805, waiting_min=2
        )
        _make_driver("far@example.com", lat=18.1300, lng=-15.9500, waiting_min=60)

        ranked, radius, round_no = select_best_driver(
            self.ride, dispatch_round=1, require_documents=False
        )
        self.assertIsNotNone(ranked)
        self.assertEqual(ranked.profile.user_id, near_user.id)
        self.assertEqual(round_no, 1)
        self.assertEqual(radius, 2.0)

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_unavailable_driver_excluded(self, _docs):
        _user, profile = _make_driver(
            "offline@example.com", lat=18.1010, lng=-15.9805
        )
        profile.is_available = False
        profile.save(update_fields=["is_available"])

        ranked, _, _ = select_best_driver(
            self.ride, require_documents=False
        )
        self.assertIsNone(ranked)

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_wrong_vehicle_category_excluded(self, _docs):
        self.ride.ride_type = "XL"
        self.ride.save(update_fields=["ride_type"])
        _make_driver(
            "regular-only@example.com",
            lat=18.1010,
            lng=-15.9805,
            car_type="regular",
        )

        ranked, _, _ = select_best_driver(
            self.ride, require_documents=False
        )
        self.assertIsNone(ranked)

        _make_driver(
            "xl-driver@example.com",
            lat=18.1015,
            lng=-15.9805,
            car_type="xl",
        )
        ranked, _, _ = select_best_driver(
            self.ride, require_documents=False
        )
        self.assertIsNotNone(ranked)
        self.assertEqual(ranked.profile.car_type, "xl")

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_expanding_radius_finds_distant_driver(self, _docs):
        # ~4.5 km away — outside 2 km, inside 5 km
        far_user, _ = _make_driver(
            "ring2@example.com", lat=18.1400, lng=-15.9800
        )

        ranked, radius, round_no = select_best_driver(
            self.ride, dispatch_round=1, require_documents=False
        )
        self.assertIsNotNone(ranked)
        self.assertEqual(ranked.profile.user_id, far_user.id)
        self.assertEqual(round_no, 2)
        self.assertEqual(radius, 5.0)

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_under_review_excluded(self, _docs):
        _make_driver(
            "review@example.com",
            lat=18.1010,
            lng=-15.9805,
            account_under_review=True,
        )
        ranked, _, _ = select_best_driver(self.ride, require_documents=False)
        self.assertIsNone(ranked)

    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_fair_rotation_prefers_longer_wait(self, _docs):
        _make_driver(
            "short-wait@example.com",
            lat=18.1005,
            lng=-15.9800,
            waiting_min=1,
            received=20,
        )
        long_user, _ = _make_driver(
            "long-wait@example.com",
            lat=18.1005,
            lng=-15.9801,
            waiting_min=90,
            received=1,
        )

        candidates = rank_eligible_drivers(
            self.ride, radius_km=2.0, require_documents=False
        )
        self.assertGreaterEqual(len(candidates), 2)
        self.assertEqual(candidates[0].profile.user_id, long_user.id)

    @patch("taxi.rides.services.ride_assignment_service.start_ride_request_timeout")
    @patch("taxi.rides.services.ride_assignment_service._broadcast_ride_request")
    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_offer_writes_audit_log(self, _docs, _broadcast, _timeout):
        driver, _ = _make_driver(
            "audit@example.com", lat=18.1008, lng=-15.9802
        )
        offered = offer_ride_to_next_driver(self.ride, require_documents=False)
        self.assertTrue(offered)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.offered_driver_id, driver.id)
        self.assertEqual(self.ride.dispatch_status, "offered")
        self.assertTrue(
            DispatchOfferLog.objects.filter(
                ride=self.ride, driver=driver, result="offered"
            ).exists()
        )

    @patch("taxi.rides.services.ride_assignment_service.start_ride_request_timeout")
    @patch("taxi.rides.services.ride_assignment_service._broadcast_ride_request")
    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_decline_moves_to_next_driver(self, _docs, _broadcast, _timeout):
        first, _ = _make_driver(
            "first@example.com", lat=18.1002, lng=-15.9800, waiting_min=10
        )
        second, _ = _make_driver(
            "second@example.com", lat=18.1004, lng=-15.9802, waiting_min=5
        )

        offer_ride_to_next_driver(self.ride, require_documents=False)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.offered_driver_id, first.id)

        handle_driver_decline(self.ride, first)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.offered_driver_id, second.id)
        self.assertIn(first.id, self.ride.declined_driver_ids)

    @patch("taxi.rides.services.ride_assignment_service.start_ride_request_timeout")
    @patch("taxi.rides.services.ride_assignment_service._broadcast_ride_request")
    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_no_driver_exits_cleanly(self, _docs, _broadcast, _timeout):
        offered = offer_ride_to_next_driver(self.ride, require_documents=False)
        self.assertFalse(offered)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.dispatch_status, "no_driver_found")
        self.assertTrue(
            DispatchOfferLog.objects.filter(
                ride=self.ride, result="no_driver"
            ).exists()
        )

    @patch("taxi.rides.services.ride_assignment_service.start_ride_request_timeout")
    @patch("taxi.rides.services.ride_assignment_service._broadcast_ride_request")
    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_only_one_driver_can_accept(self, _docs, _broadcast, _timeout):
        driver_a, _ = _make_driver(
            "accept-a@example.com", lat=18.1003, lng=-15.9800
        )
        driver_b, _ = _make_driver(
            "accept-b@example.com", lat=18.1006, lng=-15.9803
        )
        offer_ride_to_next_driver(self.ride, require_documents=False)
        self.ride.refresh_from_db()
        offered_id = self.ride.offered_driver_id
        self.assertIn(offered_id, {driver_a.id, driver_b.id})

        winner = driver_a if offered_id == driver_a.id else driver_b
        other = driver_b if offered_id == driver_a.id else driver_a
        self.client.force_authenticate(user=winner)
        ok = self.client.post(f"/rides/accept/{self.ride.id}/")
        self.assertEqual(ok.status_code, 200)

        self.client.force_authenticate(user=other)
        denied = self.client.post(f"/rides/accept/{self.ride.id}/")
        self.assertEqual(denied.status_code, 400)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.dispatch_status, "assigned")
        self.assertEqual(self.ride.driver_id, offered_id)
