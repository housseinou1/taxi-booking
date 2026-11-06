"""Regression tests — Task 7 Delivery Administration endpoints (throwaway test DB only).

GET /deliveries/admin/overview/            (new "operations" block; existing keys unchanged)
GET /deliveries/admin/deliveries/          (paginated directory)
GET /deliveries/admin/deliveries/<id>/     (read-only detail)
GET /deliveries/admin/deliveries/<id>/tracking/  (read-only tracking, no side effects)
GET /deliveries/admin/analytics/cities/    (city analytics, no name merging)
"""
import itertools
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from deliveries.models import Delivery, DriverDeliverySettings
from taxi.drivers.models import DriverProfile

_n = itertools.count(1)
DIRECTORY = "/deliveries/admin/deliveries/"
OVERVIEW = "/deliveries/admin/overview/"
CITIES = "/deliveries/admin/analytics/cities/"
PAGE_KEYS = {"count", "page", "page_size", "total_pages", "next", "previous", "results", "summary"}


class DeliveryAdminBase(APITestCase):
    @classmethod
    def user(cls, kind, **extra):
        n = next(_n)
        return User.objects.create_user(
            email=f"t7-{kind}{n}@example.com", password="x-Strong-Pass-1", first_name=kind.title(),
            last_name=f"N{n}", phone_number=f"+22288{n:06d}", national_id_number=f"88{n:08d}", **extra,
        )

    @classmethod
    def courier(cls, profile_status="approved", mode=True, suspended=False, active=True, lat=None, lng=None):
        user = cls.user("courier", user_type="driver")
        if not active:
            User.objects.filter(pk=user.pk).update(is_active=False)
        DriverProfile.objects.create(
            user=user, status=profile_status, plate_number=f"T7-{user.pk}", current_lat=lat, current_lng=lng,
        )
        DriverDeliverySettings.objects.create(driver=user, delivery_mode_enabled=mode, is_suspended=suspended)
        return user

    @classmethod
    def delivery(cls, status="delivered", driver=None, city="Nouakchott", category="package", fare="100.00",
                 days_ago=0, **extra):
        d = Delivery.objects.create(
            customer=cls.customer, driver=driver, pickup="Tevragh Zeina", destination="Ksar",
            recipient_name="R", recipient_phone="+22200000000", recipient_code_hash="h", status=status,
            service_city=city, service_category=category, fare=Decimal(fare),
            pickup_lat=18.08, pickup_lng=-15.97, destination_lat=18.10, destination_lng=-15.95, **extra,
        )
        if days_ago:
            Delivery.objects.filter(pk=d.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
        return d

    @classmethod
    def setUpTestData(cls):
        cls.staff = cls.user("staff", is_staff=True)
        # Admin endpoints are module-gated on the backend; the staff account must
        # hold a role that owns the delivery module.
        cls.staff.groups.add(Group.objects.get_or_create(name="Operations Manager")[0])
        cls.customer = cls.user("customer")


class OverviewOperationsTests(DeliveryAdminBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.available = cls.courier(mode=True)
        cls.busy_on = cls.courier(mode=True)
        cls.busy_off = cls.courier(mode=False)  # mode switched off mid-delivery: still busy
        cls.offline = cls.courier(mode=False)
        cls.exception_courier = cls.courier(mode=True)
        cls.suspended = cls.courier(mode=True, suspended=True)
        cls.inactive = cls.courier(mode=True, active=False)
        cls.pending = cls.courier(profile_status="pending", mode=True)
        cls.delivery("in_transit", driver=cls.busy_on)
        cls.delivery("picked_up", driver=cls.busy_on)  # two active deliveries: counted once
        cls.delivery("accepted", driver=cls.busy_off)
        cls.delivery("delivery_exception", driver=cls.exception_courier)
        cls.delivery("in_transit", driver=cls.suspended)  # suspended: never in the pool
        cls.delivery("requested")
        cls.delivery("requested", is_scheduled=True, scheduled_pickup_at=timezone.now() + timedelta(days=1))
        cls.delivery("delivered", driver=cls.available)

    def test_courier_metrics_follow_the_definitions(self):
        self.client.force_authenticate(self.staff)
        ops = self.client.get(OVERVIEW).json()["operations"]
        self.assertEqual(ops["couriers"], {
            "eligible_pool": 5, "busy": 2, "available": 2, "offline": 1,
            "in_exception": 1, "approved_but_suspended": 1,
        })
        c = ops["couriers"]
        self.assertEqual(c["busy"] + c["available"] + c["offline"], c["eligible_pool"])
        self.assertEqual(ops["deliveries"], {"pending": 2, "pending_scheduled": 1})
        self.assertIn("busy", ops["definitions"])

    def test_existing_overview_fields_are_unchanged(self):
        self.client.force_authenticate(self.staff)
        data = self.client.get(OVERVIEW).json()
        self.assertTrue({"couriers", "deliveries", "open_disputes", "merchants", "recent_deliveries"} <= set(data))
        self.assertEqual(set(data["couriers"]), {"total", "approved", "pending", "rejected", "suspended", "online"})
        self.assertEqual(data["couriers"]["online"], 3)  # existing definition: mode on, approved, active, not suspended

    def test_busy_matches_the_assignment_engine(self):
        # Couriers the assignment engine would skip as busy == our busy set (within the pool).
        from deliveries.admin_metrics import BUSY_DELIVERY_STATUSES
        from deliveries import notifications
        import inspect

        source = inspect.getsource(notifications.get_eligible_courier_user_ids)
        self.assertIn(repr(BUSY_DELIVERY_STATUSES), source.replace('"', "'"))


class DirectoryTests(DeliveryAdminBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.courier_a = cls.courier()
        cls.d1 = cls.delivery("delivered", driver=cls.courier_a, city="Nouakchott", category="food", fare="150.00", days_ago=3)
        cls.d2 = cls.delivery("cancelled", city="Nouadhibou", category="pharmacy", fare="80.00", days_ago=1)
        cls.d3 = cls.delivery("in_transit", driver=cls.courier_a, city="Nouakchott", category="package", fare="200.00")
        cls.d4 = cls.delivery("requested", city="Nouakchott", category="package", fare="50.00")
        cls.d5 = cls.delivery("delivered", city="Nouakchott", category="package", fare="70.00", days_ago=10)

    def get(self, **params):
        self.client.force_authenticate(self.staff)
        return self.client.get(DIRECTORY, params)

    def ids(self, response):
        return [row["id"] for row in response.json()["results"]]

    def test_contract_and_pagination(self):
        r = self.get(page_size=2)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(set(data), PAGE_KEYS)
        self.assertEqual((data["count"], data["page"], data["page_size"], data["total_pages"]), (5, 1, 2, 3))
        self.assertIsNone(data["previous"])
        self.assertIsNotNone(data["next"])
        row = data["results"][0]
        for key in ("id", "status", "service_category", "service_city", "customer_name", "courier_name", "pickup",
                    "destination", "fare", "payment_status", "created_at", "delivered_at"):
            self.assertIn(key, row)
        for secret in ("pickup_pin", "dropoff_pin", "recipient_code_hash", "recipient_phone"):
            self.assertNotIn(secret, row)
        last = self.get(page_size=2, page=3).json()
        self.assertEqual(len(last["results"]), 1)
        self.assertIsNone(last["next"])

    def test_default_ordering_newest_first(self):
        self.assertEqual(self.ids(self.get()), [self.d4.id, self.d3.id, self.d2.id, self.d1.id, self.d5.id])

    def test_ordering_options(self):
        self.assertEqual(self.ids(self.get(ordering="fare_high"))[0], self.d3.id)
        self.assertEqual(self.ids(self.get(ordering="fare_low"))[0], self.d4.id)
        self.assertEqual(self.ids(self.get(ordering="oldest"))[0], self.d5.id)
        self.assertEqual(self.get(ordering="customer__password").status_code, 400)

    def test_search_by_id_customer_and_courier(self):
        # A numeric term matches the delivery id OR any name/email containing it (documented
        # contract), so assert inclusion rather than an exact list — generated test emails
        # can contain the same digits depending on the runner.
        self.assertIn(self.d2.id, self.ids(self.get(search=str(self.d2.id))))
        self.assertIn(self.d2.id, self.ids(self.get(search=f"#{self.d2.id}")))
        self.assertEqual(self.get(search="987654321").json()["count"], 0)
        self.assertEqual(set(self.ids(self.get(search=self.courier_a.email))), {self.d1.id, self.d3.id})
        self.assertEqual(self.get(search=self.customer.last_name).json()["count"], 5)
        self.assertEqual(self.get(search="no-such-person").json()["count"], 0)

    def test_status_filters(self):
        self.assertEqual(self.ids(self.get(status="cancelled")), [self.d2.id])
        self.assertEqual(set(self.ids(self.get(status="active"))), {self.d3.id, self.d4.id})
        self.assertEqual(self.get(status="all").json()["count"], 5)
        bad = self.get(status="lost")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("valid_statuses", bad.json())

    def test_city_category_and_date_filters(self):
        self.assertEqual(self.ids(self.get(city="Nouadhibou")), [self.d2.id])
        self.assertEqual(self.get(city="nouakchott").json()["count"], 0)  # exact text, no normalisation
        self.assertEqual(self.ids(self.get(category="food")), [self.d1.id])
        self.assertEqual(self.get(category="spaceship").status_code, 400)
        today = timezone.localdate()
        recent = self.get(date_from=(today - timedelta(days=2)).isoformat())
        self.assertEqual(set(self.ids(recent)), {self.d2.id, self.d3.id, self.d4.id})
        old = self.get(date_to=(today - timedelta(days=5)).isoformat())
        self.assertEqual(self.ids(old), [self.d5.id])
        self.assertEqual(self.get(date_from="28-10-2026").status_code, 400)

    def test_summary_is_for_the_filtered_set(self):
        s = self.get(city="Nouakchott").json()["summary"]
        self.assertEqual(s["total"], 4)
        self.assertEqual(s["active"], 2)
        self.assertEqual(s["by_status"]["delivered"], 2)
        self.assertEqual(s["delivered_revenue"], "220.00")  # 150 + 70, delivered only

    def test_empty_results(self):
        data = self.get(search="zzz-none").json()
        self.assertEqual((data["count"], data["results"], data["total_pages"]), (0, [], 1))
        self.assertEqual(data["summary"]["delivered_revenue"], "0.00")

    def test_detail_is_read_only_and_safe(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get(f"{DIRECTORY}{self.d3.id}/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["id"], self.d3.id)
        self.assertEqual(data["pickup_location"], {"lat": 18.08, "lng": -15.97})
        self.assertNotIn("pickup_pin", data)
        self.assertEqual(self.client.get(f"{DIRECTORY}999999/").status_code, 404)

    def test_query_count_does_not_grow_with_rows(self):
        self.client.force_authenticate(self.staff)
        with CaptureQueriesContext(connection) as small:
            self.client.get(DIRECTORY)
        for _ in range(40):
            self.delivery("delivered", driver=self.courier_a)
        with CaptureQueriesContext(connection) as big:
            self.client.get(DIRECTORY, {"page_size": 25})
        self.assertEqual(len(small.captured_queries), len(big.captured_queries))
        self.assertLessEqual(len(big.captured_queries), 6)


class TrackingTests(DeliveryAdminBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.located = cls.courier(lat=18.09, lng=-15.96)
        cls.unlocated = cls.courier()
        cls.half = cls.courier(lat=18.09, lng=None)
        cls.other = cls.courier()

    def track(self, delivery):
        self.client.force_authenticate(self.staff)
        return self.client.get(f"{DIRECTORY}{delivery.id}/tracking/")

    def test_real_courier_coordinates(self):
        data = self.track(self.delivery("in_transit", driver=self.located)).json()
        self.assertEqual(data["courier_location"]["lat"], 18.09)
        self.assertEqual(data["courier_location"]["lng"], -15.96)
        self.assertTrue(data["courier_location"]["available"])
        self.assertIsNone(data["courier_location"]["updated_at"])
        self.assertEqual(data["destination_location"], {"lat": 18.10, "lng": -15.95})

    def test_missing_coordinates_are_null_never_the_pickup_point(self):
        for courier in (self.unlocated, self.half, None):
            with self.subTest(courier=getattr(courier, "email", None)):
                data = self.track(self.delivery("in_transit", driver=courier)).json()
                self.assertEqual(data["courier_location"]["lat"], None)
                self.assertEqual(data["courier_location"]["lng"], None)
                self.assertFalse(data["courier_location"]["available"])

    def test_pickup_and_destination_come_from_the_delivery_row(self):
        # pickup/destination coordinates are NOT NULL in the schema, so they are always present;
        # the endpoint returns the stored values unchanged.
        for name in ("pickup_lat", "pickup_lng", "destination_lat", "destination_lng"):
            self.assertFalse(Delivery._meta.get_field(name).null, name)
        d = self.delivery("requested")
        Delivery.objects.filter(pk=d.pk).update(pickup_lat=0.0, pickup_lng=0.0)
        data = self.track(d).json()
        self.assertEqual(data["pickup_location"], {"lat": 0.0, "lng": 0.0})
        self.assertEqual(data["destination_location"], {"lat": 18.10, "lng": -15.95})

    def test_last_status_update_is_the_latest_known_timestamp(self):
        d = self.delivery("picked_up", driver=self.located)
        later = timezone.now() + timedelta(minutes=5)
        Delivery.objects.filter(pk=d.pk).update(accepted_at=timezone.now(), picked_up_at=later)
        data = self.track(d).json()
        self.assertEqual(data["last_status_update_at"], data["status_timestamps"]["picked_up_at"])

    def test_polling_has_no_side_effects(self):
        # An expired offer: the shared tracking view would advance it on read.
        d = self.delivery("requested", offered_driver=self.other, assignment_round=1, declined_driver_ids=[])
        Delivery.objects.filter(pk=d.pk).update(offer_sent_at=timezone.now() - timedelta(hours=1))
        fields = ("status", "driver_id", "offered_driver_id", "offer_sent_at", "assignment_round",
                  "declined_driver_ids", "payment_status", "fare", "driver_earning", "platform_commission")
        before = Delivery.objects.filter(pk=d.pk).values(*fields).get()
        with patch("deliveries.services.assignment_service.DeliveryAssignmentService.process_expired_offer") as spy:
            for _ in range(10):
                self.assertEqual(self.track(d).status_code, 200)
                self.client.get(f"{DIRECTORY}{d.id}/")
                self.client.get(DIRECTORY)
        spy.assert_not_called()
        self.assertEqual(Delivery.objects.filter(pk=d.pk).values(*fields).get(), before)

    def test_customer_tracking_endpoint_is_unchanged(self):
        # The shared customer endpoint still processes expired offers (existing behaviour preserved).
        d = self.delivery("requested")
        with patch("deliveries.services.assignment_service.DeliveryAssignmentService.process_expired_offer",
                   side_effect=lambda delivery: delivery) as spy:
            self.client.force_authenticate(self.customer)
            self.assertEqual(self.client.get(f"/deliveries/{d.id}/tracking/").status_code, 200)
        spy.assert_called_once()


class CityAnalyticsTests(DeliveryAdminBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.delivery("delivered", city="Nouakchott", fare="100.00")
        cls.delivery("delivered", city="Nouakchott", fare="50.50")
        cls.delivery("cancelled", city="Nouakchott", fare="40.00")
        cls.delivery("in_transit", city="Nouakchott", fare="60.00")
        cls.delivery("delivered", city="nouakchott ", fare="10.00")  # spelling variant: not merged
        cls.delivery("delivery_exception", city="Nouadhibou", fare="30.00", days_ago=20)

    def get(self, **params):
        self.client.force_authenticate(self.staff)
        return self.client.get(CITIES, params)

    def test_grouped_by_exact_city_text(self):
        data = self.get().json()
        rows = {row["service_city"]: row for row in data["cities"]}
        self.assertEqual(set(rows), {"Nouakchott", "nouakchott ", "Nouadhibou"})
        nkc = rows["Nouakchott"]
        self.assertEqual((nkc["total"], nkc["completed"], nkc["cancelled"], nkc["active"]), (4, 2, 1, 1))
        self.assertEqual(nkc["delivered_revenue"], "150.50")
        self.assertEqual(rows["Nouadhibou"]["exceptions"], 1)
        self.assertEqual(rows["Nouadhibou"]["active"], 1)  # delivery_exception is in the admin active set
        self.assertEqual(data["totals"]["total"], 6)
        self.assertEqual(data["totals"]["delivered_revenue"], "160.50")
        self.assertEqual(data["possible_name_variants"], [["Nouakchott", "nouakchott "]])

    def test_revenue_matches_existing_overview_definition(self):
        self.client.force_authenticate(self.staff)
        overview = self.client.get(OVERVIEW).json()["deliveries"]["delivered_fare"]
        self.assertEqual(Decimal(self.get().json()["totals"]["delivered_revenue"]), Decimal(overview))

    def test_date_filter_and_validation(self):
        today = timezone.localdate()
        data = self.get(date_from=(today - timedelta(days=5)).isoformat()).json()
        self.assertNotIn("Nouadhibou", {row["service_city"] for row in data["cities"]})
        self.assertEqual(self.get(date_to="yesterday").status_code, 400)

    def test_empty(self):
        Delivery.objects.all().delete()
        data = self.get().json()
        self.assertEqual((data["cities"], data["possible_name_variants"], data["totals"]["total"]), ([], [], 0))


class PermissionTests(DeliveryAdminBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.courier_user = cls.courier()
        cls.d = cls.delivery("in_transit", driver=cls.courier_user)

    def urls(self):
        return [OVERVIEW, DIRECTORY, f"{DIRECTORY}{self.d.id}/", f"{DIRECTORY}{self.d.id}/tracking/", CITIES]

    def test_anonymous_denied(self):
        for url in self.urls():
            with self.subTest(url=url):
                self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_rider_and_courier_denied_even_for_their_own_delivery(self):
        for user in (self.customer, self.courier_user):
            self.client.force_authenticate(user)
            for url in self.urls():
                with self.subTest(user=user.email, url=url):
                    self.assertEqual(self.client.get(url).status_code, 403)

    def test_staff_allowed(self):
        self.client.force_authenticate(self.staff)
        for url in self.urls():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_mine_endpoint_unchanged_for_customer(self):
        self.client.force_authenticate(self.customer)
        r = self.client.get("/deliveries/mine/")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)  # still the unpaginated list
