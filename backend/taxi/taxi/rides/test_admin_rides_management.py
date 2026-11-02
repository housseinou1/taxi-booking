"""Regression tests: Admin Rides Management list + detail endpoints.

Covers GET /rides/admin/rides/ and GET /rides/admin/rides/<id>/:
  - admin-only authorization
  - pagination
  - status / ride_type / search / date filters (with 400 on invalid input)
  - whitelisted ordering
  - Decimal-safe, real-data summary
  - privacy: no pickup PIN or precise coordinates in responses
Runs only on the throwaway test DB.
"""

import itertools

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.rides.models import Ride

LIST_URL = "/rides/admin/rides/"
_counter = itertools.count(1)


class AdminRidesListTests(APITestCase):
    def _user(self, kind="rider", **extra):
        n = next(_counter)
        return User.objects.create_user(
            email=f"rides-admin-{kind}{n}@example.com",
            password="x-Strong-Pass-1",
            first_name="Rides",
            last_name=f"{kind.title()}{n}",
            phone_number=f"+22255{n:06d}",
            national_id_number=f"66{n:08d}",
            **extra,
        )

    def _admin(self):
        user = self._user("admin")
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])
        Group.objects.get_or_create(name="CEO")[0].user_set.add(user)
        return user

    def _ride(self, status="completed", ride_type="Regular", fare="275.00", pickup="Sebkha"):
        n = next(_counter)
        rider = self._user("rider")
        driver = self._user("driver", user_type="driver")
        return Ride.objects.create(
            rider=rider,
            driver=driver,
            pickup=pickup,
            destination=f"Toujounine {n}",
            ride_type=ride_type,
            distance_km="5.00",
            fare=fare,
            app_fee="82.50",
            driver_earning="192.50",
            status=status,
            completed_at=timezone.now() if status == "completed" else None,
            cancelled_at=timezone.now() if status == "cancelled" else None,
            cancellation_reason="Rider changed plans" if status == "cancelled" else "",
        )

    def setUp(self):
        self.admin = self._admin()
        self.client.force_authenticate(self.admin)

    # ---- authorization --------------------------------------------------
    def test_non_staff_cannot_list_rides(self):
        self._ride()
        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)

    def test_anonymous_cannot_list_rides(self):
        self._ride()
        from rest_framework.test import APIClient

        anonymous = APIClient()
        self.assertIn(anonymous.get(LIST_URL).status_code, (401, 403))
    # ---- shape ----------------------------------------------------------
    def test_returns_paginated_rows_with_summary(self):
        self._ride(status="completed")
        self._ride(status="cancelled")
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, 200)
        for key in ("count", "page", "page_size", "total_pages", "results", "summary"):
            self.assertIn(key, res.data)
        self.assertEqual(res.data["summary"]["total"], 2)
        self.assertEqual(res.data["summary"]["completed"], 1)
        self.assertEqual(res.data["summary"]["cancelled"], 1)
        self.assertEqual(res.data["summary"]["completed_fare"], "275.00")
        self.assertEqual(res.data["summary"]["currency"], "MRU")

    def test_summary_is_null_not_zero_when_no_completed_fare(self):
        self._ride(status="cancelled")
        res = self.client.get(LIST_URL)
        self.assertIsNone(res.data["summary"]["completed_fare"])

    def test_row_exposes_operational_columns_only(self):
        ride = self._ride()
        row = self.client.get(LIST_URL).data["results"][0]
        self.assertEqual(row["id"], ride.id)
        for key in ("status", "ride_type", "pickup", "destination", "fare",
                    "driver_earning", "payment_status", "created_at",
                    "rider_name", "driver_name"):
            self.assertIn(key, row)

    def test_never_exposes_pickup_pin_or_coordinates(self):
        self._ride()
        body = str(self.client.get(LIST_URL).data)
        for secret in ("pickup_pin", "pickup_lat", "pickup_lng",
                       "destination_lat", "destination_lng"):
            self.assertNotIn(secret, body)

    # ---- pagination -----------------------------------------------------
    def test_pagination_respects_page_size(self):
        for _ in range(3):
            self._ride()
        res = self.client.get(LIST_URL, {"page_size": 2})
        self.assertEqual(len(res.data["results"]), 2)
        self.assertEqual(res.data["total_pages"], 2)
        self.assertEqual(res.data["page"], 1)

    # ---- filters --------------------------------------------------------
    def test_status_filter(self):
        self._ride(status="completed")
        self._ride(status="cancelled")
        res = self.client.get(LIST_URL, {"status": "cancelled"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["status"], "cancelled")

    def test_invalid_status_returns_400(self):
        res = self.client.get(LIST_URL, {"status": "not_a_status"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("valid_statuses", res.data)

    def test_invalid_ride_type_returns_400(self):
        res = self.client.get(LIST_URL, {"ride_type": "Helicopter"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("valid_ride_types", res.data)

    def test_search_matches_pickup_and_ride_id(self):
        target = self._ride(pickup="Ksar")
        other = self._ride(pickup="Sebkha")
        # Searching by id also matches text fields; keep digits out of the other ride's
        # text so the result never depends on which ids the database hands out.
        Ride.objects.filter(pk=other.pk).update(destination="Toujounine")
        User.objects.filter(pk=other.rider_id).update(email="rides-admin-other-rider@example.com")
        User.objects.filter(pk=other.driver_id).update(email="rides-admin-other-driver@example.com")
        by_pickup = self.client.get(LIST_URL, {"q": "Ksar"})
        self.assertEqual(by_pickup.data["count"], 1)
        by_id = self.client.get(LIST_URL, {"q": str(target.id)})
        self.assertEqual(by_id.data["count"], 1)

    def test_malformed_dates_return_400(self):
        for param in ("date_from", "date_to"):
            with self.subTest(param=param):
                res = self.client.get(LIST_URL, {param: "not-a-date"})
                self.assertEqual(res.status_code, 400)

    def test_date_range_filters(self):
        self._ride()
        today = timezone.localdate().isoformat()
        self.assertEqual(self.client.get(LIST_URL, {"date_from": today}).data["count"], 1)
        self.assertEqual(
            self.client.get(LIST_URL, {"date_to": "2000-01-01"}).data["count"], 0
        )


    # ---- ordering -------------------------------------------------------
    def test_ordering_is_whitelisted(self):
        self._ride(fare="100.00")
        self._ride(fare="900.00")
        res = self.client.get(LIST_URL, {"ordering": "-fare"})
        fares = [row["fare"] for row in res.data["results"]]
        self.assertEqual(fares[0], "900.00")

    def test_unknown_ordering_falls_back_without_error(self):
        self._ride()
        res = self.client.get(LIST_URL, {"ordering": "; DROP TABLE rides_ride"})
        self.assertEqual(res.status_code, 200)

    # ---- detail ---------------------------------------------------------
    def test_detail_returns_ride_with_people_and_timeline(self):
        ride = self._ride()
        res = self.client.get(f"{LIST_URL}{ride.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], ride.id)
        for key in ("rider_name", "rider_email", "driver_name", "driver_email",
                    "cancellation_reason", "created_at", "status"):
            self.assertIn(key, res.data)

    def test_detail_404_for_unknown_ride(self):
        self.assertEqual(self.client.get(f"{LIST_URL}999999/").status_code, 404)

    def test_detail_requires_admin(self):
        ride = self._ride()
        self.client.force_authenticate(self._user("plain"))
        self.assertEqual(self.client.get(f"{LIST_URL}{ride.id}/").status_code, 403)

    def test_detail_never_exposes_pickup_pin(self):
        ride = self._ride()
        body = str(self.client.get(f"{LIST_URL}{ride.id}/").data)
        self.assertNotIn("pickup_pin", body)

