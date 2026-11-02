"""Phase E tests: Admin Hall of Fame endpoint (authentication, permissions, filters).

``GET /drivers/hall-of-fame/admin/`` (``drivers.views_hall_of_fame.AdminHallOfFameView``) is
the single source of the Hall of Fame screen in the unified Admin platform. These tests lock
down its security contract (``permission_classes = [IsAdminUser]``), its reporting-period and
city filters, and that the screen cannot be used to mutate recognitions.

Note on the sync helpers: the view calls ``sync_monthly_rankings(year, month)``, which
DELETES and recomputes ``driver_of_month`` / ``top_city`` / ``top_national`` rows for the
requested year+month. These tests therefore assert against ``lifetime_milestone`` rows, which
the sync only ever adds — so a filter assertion can never be satisfied by recomputed data.
"""

from authapp.models import User
from rest_framework.test import APITestCase

from taxi.drivers.models import DriverProfile, HallOfFameRecognition

ADMIN_URL = "/drivers/hall-of-fame/admin/"


def _driver(email, plate):
    user = User.objects.create_user(email=email, password="Test1234!", user_type="driver")
    return DriverProfile.objects.create(
        user=user,
        status="approved",
        is_available=False,
        plate_number=plate,
        vehicle_plate=plate,
    )


def _recognition(profile, *, title, year, month=None, rank=1):
    return HallOfFameRecognition.objects.create(
        driver=profile,
        category="lifetime_milestone",
        badge="bronze",
        title=title,
        year=year,
        month=month,
        rank=rank,
        lifetime_completed_rides=1000,
        years_with_yala=2,
        performance_score=75,
    )


class AdminHallOfFameSecurityTests(APITestCase):
    """Authentication and administrative permission checks."""

    def setUp(self):
        self.staff = User.objects.create_user(
            email="hof-staff@test.local", password="Test1234!", is_staff=True
        )
        self.regular = User.objects.create_user(
            email="hof-regular@test.local", password="Test1234!"
        )

    def test_anonymous_access_is_denied(self):
        response = self.client.get(ADMIN_URL)
        # DRF returns 401 when an authentication class can challenge, 403 otherwise.
        self.assertIn(response.status_code, (401, 403))

    def test_authenticated_non_staff_is_denied(self):
        self.client.force_authenticate(user=self.regular)
        self.assertEqual(self.client.get(ADMIN_URL).status_code, 403)

    def test_staff_receives_the_recognition_payload(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(ADMIN_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("year", response.data)
        self.assertIn("city", response.data)
        self.assertIsInstance(response.data["members"], list)

    def test_endpoint_accepts_reads_only(self):
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.post(ADMIN_URL, {}).status_code, 405)
        self.assertEqual(self.client.put(ADMIN_URL, {}).status_code, 405)


class AdminHallOfFameFilterTests(APITestCase):
    """Reporting periods (year / month) and city filters."""

    def setUp(self):
        self.staff = User.objects.create_user(
            email="hof-filters@test.local", password="Test1234!", is_staff=True
        )
        self.client.force_authenticate(user=self.staff)
        self.driver_2024 = _driver("hof-2024@test.local", "HOF-2024")
        self.driver_2025 = _driver("hof-2025@test.local", "HOF-2025")
        _recognition(self.driver_2024, title="1,000 Lifetime Rides", year=2024, month=3)
        _recognition(self.driver_2025, title="1,000 Lifetime Rides", year=2025, month=4)

    def _titles(self, **params):
        response = self.client.get(ADMIN_URL, params)
        self.assertEqual(response.status_code, 200)
        return {member["title"] for member in response.data["members"]}

    def _drivers(self, **params):
        response = self.client.get(ADMIN_URL, params)
        self.assertEqual(response.status_code, 200)
        return {member["driver_id"] for member in response.data["members"]}

    def test_year_filter_scopes_the_reporting_period(self):
        self.assertEqual(self._drivers(year=2024), {self.driver_2024.id})
        self.assertEqual(self._drivers(year=2025), {self.driver_2025.id})

    def test_month_filter_scopes_the_reporting_period(self):
        self.assertEqual(self._drivers(year=2024, month=3), {self.driver_2024.id})
        self.assertEqual(self._drivers(year=2024, month=4), set())

    def test_city_filter_is_applied(self):
        # The filter is honoured even when it matches nothing: an unknown city id must not
        # silently return the unfiltered list.
        self.assertEqual(self._drivers(year=2024, city=999999), set())
        self.assertEqual(self._drivers(year=2024), {self.driver_2024.id})

    def test_no_recognitions_are_fabricated_when_none_exist(self):
        self.assertEqual(self._drivers(year=1999), set())

    def test_serialized_member_exposes_the_verifiable_fields(self):
        response = self.client.get(ADMIN_URL, {"year": 2024})
        member = response.data["members"][0]
        for field in (
            "id",
            "driver_id",
            "driver_name",
            "category",
            "badge",
            "title",
            "city",
            "year",
            "month",
            "rank",
            "lifetime_completed_rides",
            "years_with_yala",
            "performance_score",
        ):
            self.assertIn(field, member)
