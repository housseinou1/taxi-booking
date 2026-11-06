"""Regression tests: GET /rides/admin/financial-summary/ (Task 4).

The oracle is the CURRENT dashboard path: GET /rides/history/ as staff (RideSerializer,
payment_status from the latest Payment), then the exact AdminDashboard.js arithmetic
re-implemented below (JS Number() float sums in response order, Array.filter predicates,
Math.round). Every figure the endpoint returns is compared against it.

Runs only on the throwaway test DB.
"""
import itertools
import math
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from locations.models import City as LocationCity, Region as LocationRegion
from payments.models import Payment
from taxi.rides.admin_financial_summary import _js_number, build_admin_financial_summary
from taxi.rides.models import Ride

URL = "/rides/admin/financial-summary/"
HISTORY_URL = "/rides/history/"
_counter = itertools.count(1)
ALL_STATUSES = [value for value, _ in Ride.STATUS_CHOICES] + ["pending", "accepted"]


def dashboard_oracle(rides):
    """AdminDashboard.js (lines ~1011-1080) applied to the /rides/history/ payload."""
    js_round = lambda x: math.floor(x + 0.5)  # noqa: E731 — Math.round for non-negative values
    num = lambda v: float(v) if v not in (None, "") else 0.0  # noqa: E731 — Number(v || 0)
    active = ["requested", "pending", "accepted", "driver_arriving", "driver_arrived", "in_progress"]
    total_revenue = 0.0
    platform_commission = 0.0
    driver_payouts = 0.0
    for ride in rides:  # Array.reduce order
        total_revenue += num(ride.get("fare"))
        platform_commission += num(ride.get("app_fee"))
        driver_payouts += num(ride.get("driver_earning"))
    completed = [r for r in rides if r["status"] == "completed"]
    cancelled = [r for r in rides if r["status"] in ("cancelled", "rider_no_show")]
    n = len(rides)
    return {
        "total": n,
        "paid": sum(1 for r in rides if r["payment_status"] == "paid"),
        "unpaid": sum(1 for r in rides if r["payment_status"] != "paid"),
        "completed": len(completed),
        "cancelled": len(cancelled),
        "rider_no_show": sum(1 for r in rides if r["status"] == "rider_no_show" or r.get("is_rider_no_show")),
        "active": sum(1 for r in rides if r["status"] in active),
        "driver_arriving": sum(1 for r in rides if r["status"] == "driver_arriving"),
        "in_progress": sum(1 for r in rides if r["status"] == "in_progress"),
        "waiting": sum(1 for r in rides if r["status"] in ("requested", "pending")),
        "total_revenue": total_revenue,
        "platform_commission": platform_commission,
        "driver_payouts": driver_payouts,
        "completion_rate": js_round(len(completed) / n * 100) if n else 0,
        "cancellation_rate": js_round(len(cancelled) / n * 100) if n else 0,
        "average_fare": js_round(total_revenue / n) if n else 0,
    }


class FinancialSummaryBase(APITestCase):
    @classmethod
    def _user(cls, kind="rider", **extra):
        n = next(_counter)
        return User.objects.create_user(
            email=f"fin-summary-{kind}{n}@example.com", password="x-Strong-Pass-1",
            first_name="Fin", last_name=f"{kind.title()}{n}", phone_number=f"+22277{n:06d}",
            national_id_number=f"77{n:08d}", **extra,
        )

    @classmethod
    def setUpTestData(cls):
        cls.staff = cls._user("staff", is_staff=True)
        # module-gated admin endpoint: the acting admin needs an explicit role,
        # otherwise it resolves to the minimal "staff" module set (HTTP 403).
        Group.objects.get_or_create(name="CEO")[0].user_set.add(cls.staff)
        cls.ceo = cls._user("ceo", is_staff=True)
        Group.objects.get_or_create(name="CEO")[0].user_set.add(cls.ceo)
        cls.rider = cls._user("rider")
        cls.driver = cls._user("driver", user_type="driver")
        region = LocationRegion.objects.create(name="Fin Region")
        cls.city_a = LocationCity.objects.create(region=region, name="Fin City A")
        cls.city_b = LocationCity.objects.create(region=region, name="Fin City B")

    def ride(self, status, fare="100.00", app_fee="20.00", driver_earning="80.00", city=None, no_show=False):
        return Ride.objects.create(
            rider=self.rider, driver=self.driver, pickup="P", destination="D", status=status,
            fare=Decimal(fare), app_fee=Decimal(app_fee), driver_earning=Decimal(driver_earning),
            city=city, is_rider_no_show=no_show,
        )

    def pay(self, ride, status, at):
        payment = Payment.objects.create(ride_id=ride.id, rider=self.rider, amount=ride.fare, status=status)
        Payment.objects.filter(pk=payment.pk).update(created_at=at)
        return payment

    def history(self, city=None):
        self.client.force_authenticate(user=self.staff)
        path = HISTORY_URL + (f"?city={city}" if city else "")
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def summary(self, city=None, user=None):
        self.client.force_authenticate(user=user or self.staff)
        path = URL + (f"?city={city}" if city else "")
        return self.client.get(path)

    def assert_matches_dashboard(self, city=None):
        expected = dashboard_oracle(self.history(city=city))
        response = self.summary(city=city)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        counts = data["counts"]
        for key in ("total", "paid", "unpaid", "completed", "cancelled", "rider_no_show", "active",
                    "driver_arriving", "in_progress", "waiting"):
            self.assertEqual(counts[key], expected[key], key)
        self.assertEqual(data["rates"]["completion_rate_pct"], expected["completion_rate"])
        self.assertEqual(data["rates"]["cancellation_rate_pct"], expected["cancellation_rate"])
        self.assertEqual(data["average_fare"], expected["average_fare"])
        floats = data["dashboard_float_totals"]
        self.assertEqual(floats["total_revenue"], expected["total_revenue"])
        self.assertEqual(floats["platform_commission"], expected["platform_commission"])
        self.assertEqual(floats["driver_earnings"], expected["driver_payouts"])
        return data, expected


class FinancialSummaryEquivalenceTests(FinancialSummaryBase):
    def setUp(self):
        now = timezone.now()
        # Every status (incl. legacy "pending"/"accepted" strings the dashboard also checks).
        for idx, status in enumerate(ALL_STATUSES):
            ride = self.ride(status, fare=f"{100 + idx}.25", app_fee=f"{10 + idx}.05", driver_earning=f"{90 + idx}.20",
                             city=self.city_a if idx % 2 else self.city_b)
            if idx % 3 == 0:
                self.pay(ride, "paid", now - timedelta(minutes=idx))
        # A no-show flagged ride whose status is completed (counted by the flag, not the status).
        self.ride("completed", no_show=True, city=self.city_a)
        # Multiple payments: the latest decides. Older "paid" then newer "failed" -> unpaid.
        r1 = self.ride("completed", city=self.city_a)
        self.pay(r1, "paid", now - timedelta(hours=2))
        self.pay(r1, "failed", now - timedelta(hours=1))
        # Older "failed" then newer "paid" -> paid.
        r2 = self.ride("completed", city=self.city_b)
        self.pay(r2, "failed", now - timedelta(hours=2))
        self.pay(r2, "paid", now - timedelta(hours=1))
        # Missing payment -> unpaid.
        self.ride("completed", city=self.city_a)
        # Zero-value money ("0.00" -> Number("0.00") = 0).
        self.ride("cancelled", fare="0.00", app_fee="0.00", driver_earning="0.00", city=self.city_b)

    def test_all_cities_match_dashboard(self):
        data, expected = self.assert_matches_dashboard()
        self.assertEqual(data["counts"]["total"], len(ALL_STATUSES) + 5)
        self.assertGreater(expected["paid"], 0)
        self.assertGreater(expected["unpaid"], 0)
        self.assertGreater(expected["rider_no_show"], 1)

    def test_city_filter_matches_dashboard(self):
        for city in (self.city_a.id, self.city_b.id):
            with self.subTest(city=city):
                data, _ = self.assert_matches_dashboard(city=city)
                self.assertEqual(data["window"]["city_id"], city)

    def test_latest_payment_decides(self):
        data = self.summary().json()
        # Only r2 (latest paid) and the every-third-status rides with a single paid payment are paid.
        single_paid = sum(1 for idx in range(len(ALL_STATUSES)) if idx % 3 == 0)
        self.assertEqual(data["counts"]["paid"], single_paid + 1)

    def test_exact_decimal_totals(self):
        data = self.summary().json()
        rides = Ride.objects.order_by("-id")[:500]
        self.assertEqual(data["money"]["total_revenue"], str(sum(r.fare for r in rides).quantize(Decimal("0.01"))))
        self.assertEqual(data["money"]["platform_commission"], str(sum(r.app_fee for r in rides).quantize(Decimal("0.01"))))
        self.assertEqual(data["money"]["driver_earnings"], str(sum(r.driver_earning for r in rides).quantize(Decimal("0.01"))))


class FinancialSummaryTieTests(FinancialSummaryBase):
    def test_equal_payment_timestamps_follow_the_same_lookup(self):
        at = timezone.now() - timedelta(minutes=5)
        for first, second in (("paid", "failed"), ("failed", "paid"), ("paid", "paid"), ("pending", "failed")):
            ride = self.ride("completed")
            self.pay(ride, first, at)
            self.pay(ride, second, at)
        self.assert_matches_dashboard()


class FinancialSummaryRoundingTests(FinancialSummaryBase):
    def test_float_rounding_and_half_up_rates(self):
        # 0.10/0.20-style values make float sums inexact; 8 rides with 1 completed = 12.5% (JS rounds to 13).
        for idx in range(8):
            self.ride("completed" if idx == 0 else "requested", fare="0.10" if idx % 2 else "0.20",
                      app_fee="0.30", driver_earning="0.70")
        data, expected = self.assert_matches_dashboard()
        self.assertEqual(data["rates"]["completion_rate_pct"], 13)
        self.assertEqual(data["money"]["total_revenue"], "1.20")  # exact Decimal
        # The dashboard's float total is not exactly 1.2; the endpoint reports both explicitly.
        self.assertEqual(data["dashboard_float_totals"]["total_revenue"], expected["total_revenue"])

    def test_half_fare_average_rounds_like_math_round(self):
        self.ride("completed", fare="100.50")
        self.ride("completed", fare="100.50")
        data, _ = self.assert_matches_dashboard()
        self.assertEqual(data["average_fare"], 101)  # Python round() would give 100

    def test_null_financial_values_are_zero(self):
        # fare/app_fee/driver_earning are NOT NULL in the schema; the JS `Number(v || 0)` guard is
        # mirrored for completeness.
        self.assertEqual(_js_number(None), 0.0)
        for name in ("fare", "app_fee", "driver_earning"):
            self.assertFalse(Ride._meta.get_field(name).null, name)

    def test_empty_window(self):
        data, _ = self.assert_matches_dashboard()
        self.assertEqual(data["counts"]["total"], 0)
        self.assertEqual(data["average_fare"], 0)
        self.assertEqual(data["money"]["total_revenue"], "0.00")


class FinancialSummaryWindowTests(FinancialSummaryBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        statuses = ["completed", "cancelled", "requested", "in_progress", "rider_no_show"]
        Ride.objects.bulk_create([
            Ride(rider=cls.rider, driver=cls.driver, pickup="P", destination="D", status=statuses[i % 5],
                 fare=Decimal("10.00") + i, app_fee=Decimal("2.00"), driver_earning=Decimal("8.00") + i)
            for i in range(520)
        ])

    def test_only_latest_500_rides_by_id(self):
        data, _ = self.assert_matches_dashboard()
        self.assertEqual(data["counts"]["total"], 500)
        oldest_20 = Ride.objects.order_by("id")[:20]
        newest_500 = Ride.objects.order_by("-id")[:500]
        self.assertEqual(Decimal(data["money"]["total_revenue"]), sum(r.fare for r in newest_500))
        self.assertNotIn(oldest_20[0].id, {r.id for r in newest_500})

    def test_query_count_is_constant(self):
        with CaptureQueriesContext(connection) as big:
            build_admin_financial_summary()
        Ride.objects.filter(id__in=list(Ride.objects.order_by("id").values_list("id", flat=True)[:480])).delete()
        with CaptureQueriesContext(connection) as small:
            build_admin_financial_summary()
        self.assertEqual(len(big.captured_queries), 1)
        self.assertEqual(len(small.captured_queries), 1)


class FinancialSummaryPermissionTests(FinancialSummaryBase):
    def test_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_rider_and_driver_rejected(self):
        for user in (self.rider, self.driver):
            with self.subTest(user=user.email):
                self.assertEqual(self.summary(user=user).status_code, 403)

    def test_staff_and_ceo_allowed(self):
        for user in (self.staff, self.ceo):
            with self.subTest(user=user.email):
                self.assertEqual(self.summary(user=user).status_code, 200)

    def test_invalid_city_is_400(self):
        self.assertEqual(self.summary(city="abc").status_code, 400)

    def test_contract_shape(self):
        data = self.summary().json()
        self.assertEqual(set(data), {"window", "money", "counts", "rates", "average_fare", "dashboard_float_totals"})
        self.assertEqual(set(data["money"]), {"total_revenue", "platform_commission", "driver_earnings"})
        self.assertEqual(set(data["counts"]), {"total", "completed", "cancelled", "rider_no_show", "active", "waiting",
                                               "driver_arriving", "in_progress", "paid", "unpaid"})
