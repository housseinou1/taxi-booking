"""Tests for Dynamic City Management (Founder/CEO city-expansion directive).

Covers the 20 required cases: adding Atar, Kaédi, Sélibaby and Zouérat,
duplicate prevention, editing, activation, deactivation, independent ride and
delivery activation, city-specific pricing, driver/courier/rider city
assignment, unsupported-city restrictions, service-area validation, CEO and
administrative permissions, city reporting, and existing-city compatibility.
"""

from decimal import Decimal

from authapp.models import User
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from cities.models import (
    SERVICE_DELIVERY,
    SERVICE_DRIVER,
    SERVICE_RIDER,
    City,
    CityPricingProfile,
    CityProfile,
    CityServiceArea,
    CityServiceConfig,
    Region,
)
from cities.services import (
    ServiceUnavailable,
    assert_service_available,
    city_management_ready,
    city_performance,
    coverage_check,
    ensure_city,
    ensure_service_catalog,
    get_pricing,
    normalize_name,
    people_by_city,
    serialize_city,
    service_available,
    services_for_city,
    set_city_active,
    set_city_live,
    set_service_active,
    update_pricing,
)

LIST_URL = "/cities/management/"
AVAILABLE_URL = "/cities/available/"

EXPANSION = [
    ("Atar", "Adrar", "أطار"),
    ("Kaedi", "Gorgol", "كيهيدي"),
    ("Selibaby", "Guidimakha", "سيلبابي"),
    ("Zouerate", "Tiris Zemmour", "ازويرات"),
]


def _user(email, is_staff=False, is_superuser=False, city=None, user_type="rider"):
    return User.objects.create_user(
        email=email,
        password="pw",
        is_staff=is_staff,
        is_superuser=is_superuser,
        user_type=user_type,
        city=city,
    )


def _in_group(user, group_name):
    group, _ = Group.objects.get_or_create(name=group_name)
    user.groups.add(group)
    return user


def _detail_url(city_id, suffix=""):
    return f"/cities/management/{city_id}/{suffix}"


class CityRegistrationTests(TestCase):
    """Cases 1-5: add the four cities, and never duplicate one."""

    def test_all_four_expansion_cities_are_registered_exactly_once(self):
        for name, region, name_ar in EXPANSION:
            matches = [
                city
                for city in City.objects.select_related("region")
                if normalize_name(city.name) == normalize_name(name)
            ]
            self.assertGreaterEqual(
                len(matches), 1, f"{name} should be registered by the data migration"
            )
            with self.subTest(city=name):
                primary = matches[0]
                self.assertEqual(primary.region.name, region)
                self.assertTrue(primary.name_ar)

    def test_each_expansion_city_reports_existing_and_creates_no_duplicate(self):
        before = City.objects.count()
        for name, region, _name_ar in EXPANSION:
            city, created = ensure_city(name=name, region_name=region)
            self.assertFalse(created, f"{name} must not be created twice")
            self.assertEqual(city.region.name, region)
        self.assertEqual(City.objects.count(), before)

    def test_adding_a_brand_new_city_creates_it_once(self):
        city, created = ensure_city(
            name="Nbeika", region_name="Trarza", name_fr="N'Béika", name_ar="انبيكة"
        )
        self.assertTrue(created)
        self.assertEqual(city.region.name, "Trarza")
        self.assertTrue(city.is_active)

        again, created_again = ensure_city(name="Nbeika", region_name="Trarza")
        self.assertFalse(created_again)
        self.assertEqual(again.pk, city.pk)
        self.assertEqual(City.objects.filter(name__iexact="Nbeika").count(), 1)

    def test_accent_case_and_punctuation_variants_do_not_duplicate(self):
        city, _ = ensure_city(name="Tintane", region_name="Hodh El Gharbi")
        for variant in ["TINTANE", "tintane", "  Tintane  ", "Tintané"]:
            found, created = ensure_city(name=variant, region_name="Hodh El Gharbi")
            self.assertFalse(created, f"variant {variant!r} created a duplicate")
            self.assertEqual(found.pk, city.pk)

    def test_new_city_is_not_live_and_has_no_active_service(self):
        city, _ = ensure_city(name="Zouerat", region_name="Tiris Zemmour")
        ensure_service_catalog(city)
        profile = CityProfile.objects.get(city=city)
        self.assertFalse(profile.is_live)
        self.assertFalse(
            CityServiceConfig.objects.filter(city=city, is_active=True).exists()
        )

    def test_service_catalog_covers_every_service_and_category(self):
        city, _ = ensure_city(name="Kaedi", region_name="Gorgol")
        ensure_service_catalog(city)
        matrix = services_for_city(city)
        self.assertTrue(matrix["ready"])
        self.assertEqual(
            {row["category"] for row in matrix["services"][SERVICE_RIDER]["categories"]},
            {"standard", "shared"},
        )
        self.assertEqual(
            {row["category"] for row in matrix["services"][SERVICE_DRIVER]["categories"]},
            {"registration", "availability", "matching"},
        )
        self.assertEqual(
            len(matrix["services"][SERVICE_DELIVERY]["categories"]),
            6,
            "food, grocery, pharmacy, parcel, document and shopping",
        )

    def test_ensure_service_catalog_is_idempotent(self):
        city, _ = ensure_city(name="Boutilimit", region_name="Trarza")
        first = ensure_service_catalog(city)
        second = ensure_service_catalog(city)
        self.assertGreater(first, 0, "the first call must create the catalog")
        self.assertEqual(second, 0, "a second call must create nothing")
        self.assertEqual(
            CityServiceConfig.objects.filter(city=city).count(),
            CityServiceConfig.objects.filter(city=city).values("service", "category").count(),
        )

    def test_the_ceo_spelling_of_zouerat_does_not_create_a_duplicate(self):
        """The directive spells "Zouérat"; the registry holds "Zouerate"."""
        before = City.objects.count()
        city, created = ensure_city(name="Zouérat", region_name="Tiris Zemmour")
        self.assertFalse(created, "'Zouérat' must resolve to the existing city")
        self.assertEqual(city.name, "Zouerate")
        self.assertEqual(City.objects.count(), before)


class CityActivationTests(TestCase):
    """Cases 6-8: edit, activate and deactivate a city."""

    def setUp(self):
        self.city, _ = ensure_city(name="Atar", region_name="Adrar")

    def test_city_can_be_deactivated_then_activated(self):
        city, changed = set_city_active(self.city, False, reason="test")
        self.assertTrue(changed)
        self.assertFalse(city.is_active)

        again, changed_again = set_city_active(city, False)
        self.assertFalse(changed_again, "a no-op must not write or audit again")

        city, changed = set_city_active(city, True)
        self.assertTrue(changed)
        self.assertTrue(city.is_active)

    def test_deactivation_preserves_the_record_and_relationships(self):
        original_id = self.city.pk
        original_region = self.city.region_id
        set_city_active(self.city, False)
        self.city.refresh_from_db()
        self.assertEqual(self.city.pk, original_id)
        self.assertEqual(self.city.region_id, original_region)
        self.assertEqual(City.objects.filter(pk=original_id).count(), 1)

    def test_city_information_can_be_edited(self):
        self.city.name_fr = "Atar Ville"
        self.city.save(update_fields=["name_fr"])
        self.city.refresh_from_db()
        self.assertEqual(self.city.name_fr, "Atar Ville")
        self.assertEqual(self.city.name, "Atar", "the canonical name must not change")

    def test_city_cannot_go_live_without_an_active_service(self):
        with self.assertRaises(ServiceUnavailable):
            set_city_live(self.city, True)

    def test_city_can_go_live_once_a_service_is_active(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        _city, changed = set_city_live(self.city, True)
        self.assertTrue(changed)
        self.assertTrue(CityProfile.objects.get(city=self.city).is_live)

    def test_live_operations_can_be_closed_again(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        set_city_live(self.city, True)
        _city, changed = set_city_live(self.city, False)
        self.assertTrue(changed)
        self.assertFalse(CityProfile.objects.get(city=self.city).is_live)


class IndependentServiceActivationTests(TestCase):
    """Cases 9-10 and 15: rides without delivery, delivery without rides."""

    def setUp(self):
        self.city, _ = ensure_city(name="Kaedi", region_name="Gorgol")
        ensure_service_catalog(self.city)

    def test_rides_can_be_active_while_delivery_stays_inactive(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        set_city_live(self.city, True)
        self.assertTrue(service_available(self.city, SERVICE_RIDER))
        self.assertFalse(service_available(self.city, SERVICE_DELIVERY))
        self.assertFalse(service_available(self.city, SERVICE_DELIVERY, "food"))

    def test_delivery_can_be_active_while_rides_stay_inactive(self):
        set_service_active(self.city, SERVICE_DELIVERY, "food", True)
        set_city_live(self.city, True)
        self.assertTrue(service_available(self.city, SERVICE_DELIVERY, "food"))
        self.assertFalse(service_available(self.city, SERVICE_RIDER))

    def test_shared_rides_are_independent_of_standard_rides(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        set_city_live(self.city, True)
        self.assertTrue(service_available(self.city, SERVICE_RIDER, "standard"))
        self.assertFalse(service_available(self.city, SERVICE_RIDER, "shared"))

    def test_delivery_categories_are_independent_of_each_other(self):
        set_service_active(self.city, SERVICE_DELIVERY, "pharmacy", True)
        set_city_live(self.city, True)
        self.assertTrue(service_available(self.city, SERVICE_DELIVERY, "pharmacy"))
        self.assertFalse(service_available(self.city, SERVICE_DELIVERY, "food"))

    def test_service_is_unavailable_while_the_city_is_not_live(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        self.assertFalse(
            service_available(self.city, SERVICE_RIDER),
            "an activated service must not be reachable before the city is live",
        )

    def test_assert_service_available_raises_for_an_unsupported_city(self):
        with self.assertRaises(ServiceUnavailable):
            assert_service_available(self.city, SERVICE_RIDER, "standard")

    def test_unknown_service_or_category_is_rejected(self):
        with self.assertRaises(ValueError):
            set_service_active(self.city, "teleport", "standard", True)
        with self.assertRaises(ValueError):
            set_service_active(self.city, SERVICE_RIDER, "submarine", True)


class CityPricingTests(TestCase):
    """Case 11: city-specific pricing, never copied and never auto-activated."""

    def setUp(self):
        self.city, _ = ensure_city(name="Selibaby", region_name="Guidimakha")
        self.other, _ = ensure_city(name="Nouakchott", region_name="Nouakchott")

    def test_a_new_city_does_not_inherit_another_city_pricing(self):
        update_pricing(self.other, {"base_fare": "200", "per_km": "20"})
        _profile, _created, _changed = update_pricing(self.city, {"base_fare": "150"})
        other_profile = CityPricingProfile.objects.get(city=self.other)
        new_profile = CityPricingProfile.objects.get(city=self.city)
        self.assertEqual(other_profile.base_fare, Decimal("200.00"))
        self.assertEqual(new_profile.base_fare, Decimal("150.00"))
        self.assertEqual(
            new_profile.per_km,
            Decimal("0.00"),
            "unset values must stay zero, not be copied from another city",
        )

    def test_pricing_is_inactive_until_activated(self):
        profile, _created, _changed = update_pricing(self.city, {"base_fare": "150"})
        self.assertFalse(profile.is_active)
        self.assertFalse(get_pricing(self.city)["is_active"])

    def test_pricing_can_be_activated_explicitly(self):
        update_pricing(self.city, {"base_fare": "150"}, activate=True)
        self.assertTrue(CityPricingProfile.objects.get(city=self.city).is_active)

    def test_negative_pricing_is_rejected(self):
        with self.assertRaises(Exception):
            update_pricing(self.city, {"base_fare": "-5"})

    def test_minimum_fare_below_base_fare_is_rejected(self):
        with self.assertRaises(Exception):
            update_pricing(self.city, {"base_fare": "300", "minimum_fare": "100"})

    def test_fare_estimates_use_this_city_profile_only(self):
        update_pricing(
            self.city,
            {
                "base_fare": "200",
                "per_km": "20",
                "minimum_fare": "250",
                "service_fee": "10",
            },
        )
        profile = CityPricingProfile.objects.get(city=self.city)
        self.assertEqual(profile.estimate_ride_fare(10), Decimal("410.00"))
        self.assertEqual(profile.estimate_ride_fare(0), Decimal("250.00"))

    def test_delivery_pricing_is_separate_from_ride_pricing(self):
        update_pricing(
            self.city,
            {
                "base_fare": "200",
                "per_km": "20",
                "delivery_base_fare": "100",
                "delivery_per_km": "15",
            },
        )
        profile = CityPricingProfile.objects.get(city=self.city)
        self.assertEqual(profile.estimate_delivery_fare(10), Decimal("250.00"))


class ServiceAreaTests(TestCase):
    """Case 16: service-area validation and coverage checks."""

    def setUp(self):
        self.city, _ = ensure_city(name="Zouerate", region_name="Tiris Zemmour")

    def test_radius_area_contains_its_centre_and_excludes_distant_points(self):
        area = CityServiceArea.objects.create(
            city=self.city,
            name="Centre",
            center_latitude=22.7354,
            center_longitude=-12.4783,
            radius_km=10,
        )
        self.assertTrue(area.contains(22.7354, -12.4783))
        self.assertFalse(area.contains(18.0735, -15.9582))

    def test_polygon_area_uses_point_in_polygon(self):
        area = CityServiceArea.objects.create(
            city=self.city,
            name="Zone",
            polygon=[[22.0, -13.0], [23.0, -13.0], [23.0, -12.0], [22.0, -12.0]],
        )
        self.assertTrue(area.contains(22.5, -12.5))
        self.assertFalse(area.contains(30.0, -12.5))

    def test_a_radius_boundary_requires_a_centre(self):
        area = CityServiceArea(
            city=self.city, name="Bad", radius_km=5, center_latitude=None
        )
        with self.assertRaises(Exception):
            area.full_clean()

    def test_a_non_positive_radius_is_rejected(self):
        area = CityServiceArea(
            city=self.city,
            name="Bad",
            radius_km=0,
            center_latitude=22.7,
            center_longitude=-12.4,
        )
        with self.assertRaises(Exception):
            area.full_clean()

    def test_a_polygon_needs_at_least_three_points(self):
        area = CityServiceArea(
            city=self.city, name="Bad", polygon=[[22.0, -13.0], [23.0, -12.0]]
        )
        with self.assertRaises(Exception):
            area.full_clean()

    def test_coverage_reports_not_configured_when_no_boundary_exists(self):
        result = coverage_check(self.city, 22.7354, -12.4783)
        self.assertFalse(result["configured"])
        self.assertIsNone(result["inside"])

    def test_coverage_reports_inside_and_outside_with_a_boundary(self):
        CityServiceArea.objects.create(
            city=self.city,
            name="Centre",
            center_latitude=22.7354,
            center_longitude=-12.4783,
            radius_km=10,
        )
        self.assertTrue(coverage_check(self.city, 22.7354, -12.4783)["inside"])
        self.assertFalse(coverage_check(self.city, 16.6166, -11.4042)["inside"])


class DriverCourierRiderAssignmentTests(TestCase):
    """Cases 12-14: driver, courier and rider city assignment."""

    def setUp(self):
        from deliveries.models import DriverDeliverySettings
        from taxi.drivers.models import DriverProfile

        self.DriverProfile = DriverProfile
        self.DriverDeliverySettings = DriverDeliverySettings
        self.city, _ = ensure_city(name="Atar", region_name="Adrar")

    def test_driver_is_assigned_to_its_operating_city(self):
        driver = _user("driver@yala.test", city=self.city, user_type="driver")
        self.DriverProfile.objects.create(user=driver, status="approved", is_available=True)

        people = people_by_city(self.city)
        self.assertEqual(people["total_drivers"], 1)
        self.assertEqual(people["total_couriers"], 0)
        self.assertEqual(people["drivers"][0]["status"], "approved")
        self.assertTrue(people["drivers"][0]["is_available"])

    def test_courier_is_reported_as_courier_and_not_double_counted_as_driver(self):
        courier = _user("courier@yala.test", city=self.city, user_type="driver")
        self.DriverProfile.objects.create(user=courier, status="approved")
        self.DriverDeliverySettings.objects.create(driver=courier)

        people = people_by_city(self.city)
        self.assertEqual(people["total_couriers"], 1)
        self.assertEqual(
            people["total_drivers"], 0, "a courier must not also count as a driver"
        )
        self.assertTrue(people["couriers"][0]["is_courier"])

    def test_drivers_in_another_city_are_not_counted(self):
        other, _ = ensure_city(name="Nouadhibou", region_name="Dakhlet Nouadhibou")
        here = _user("here@yala.test", city=self.city, user_type="driver")
        away = _user("away@yala.test", city=other, user_type="driver")
        self.DriverProfile.objects.create(user=here)
        self.DriverProfile.objects.create(user=away)

        self.assertEqual(people_by_city(self.city)["total_drivers"], 1)
        self.assertEqual(people_by_city(other)["total_drivers"], 1)

    def test_rider_city_selection_returns_riders_of_that_city(self):
        _user("rider1@yala.test", city=self.city, user_type="rider")
        _user("rider2@yala.test", city=self.city, user_type="rider")
        other, _ = ensure_city(name="Kiffa", region_name="Assaba")
        _user("rider3@yala.test", city=other, user_type="rider")

        self.assertEqual(city_performance(self.city)["total_riders"], 2)
        self.assertEqual(city_performance(other)["total_riders"], 1)


class CityReportingTests(TestCase):
    """Case 19: verified city reporting, no fabricated or double-counted money."""

    def setUp(self):
        from taxi.rides.models import Ride

        self.Ride = Ride
        self.city, _ = ensure_city(name="Kaedi", region_name="Gorgol")
        self.rider = _user("rider@yala.test", city=self.city, user_type="rider")

    def _ride(self, status, fare, app_fee):
        return self.Ride.objects.create(
            rider=self.rider,
            pickup="A",
            destination="B",
            status=status,
            fare=Decimal(fare),
            app_fee=Decimal(app_fee),
        )

    def test_only_completed_rides_count_towards_value_and_revenue(self):
        self._ride("completed", "500", "150")
        self._ride("completed", "300", "90")
        self._ride("cancelled", "400", "120")

        performance = city_performance(self.city)
        self.assertEqual(performance["completed_rides"], 2)
        self.assertEqual(performance["cancelled_rides"], 1)
        self.assertEqual(performance["gross_transaction_value"], 800.0)
        self.assertEqual(
            performance["platform_revenue"],
            240.0,
            "platform revenue is the settled app fee of completed rides only",
        )

    def test_reporting_exposes_the_required_ceo_fields(self):
        performance = city_performance(self.city)
        for field in [
            "total_drivers",
            "approved_drivers",
            "active_drivers",
            "total_couriers",
            "active_couriers",
            "total_riders",
            "completed_rides",
            "cancelled_rides",
            "completed_deliveries",
            "cancelled_deliveries",
            "gross_transaction_value",
            "platform_revenue",
            "operational_status",
        ]:
            self.assertIn(field, performance, f"{field} must be reported")

    def test_a_new_city_reports_zero_and_not_fabricated_figures(self):
        fresh, _ = ensure_city(name="Aleg", region_name="Brakna")
        performance = city_performance(fresh)
        self.assertEqual(performance["completed_rides"], 0)
        self.assertEqual(performance["gross_transaction_value"], 0.0)
        self.assertEqual(performance["platform_revenue"], 0.0)
        self.assertEqual(performance["operational_status"], "registered")


class ExistingCityCompatibilityTests(TestCase):
    """Case 20: the existing registry and its identifiers are preserved."""

    def test_pre_existing_cities_are_still_present_and_active(self):
        for name in ["Nouakchott", "Nouadhibou", "Rosso", "Kiffa"]:
            city = City.objects.filter(name__iexact=name).first()
            self.assertIsNotNone(city, f"{name} must be preserved")
            self.assertTrue(city.is_active)

    def test_the_registry_was_not_reduced_by_the_expansion(self):
        self.assertGreaterEqual(
            City.objects.count(), 60, "the registry must not lose existing cities"
        )

    def test_serializing_a_legacy_city_does_not_fail_without_a_profile(self):
        city = City.objects.filter(name__iexact="Kiffa").first()
        payload = serialize_city(city)
        self.assertEqual(payload["name"], city.name)
        self.assertIn("operational_status", payload)
        self.assertEqual(payload["country"], "Mauritania")

    def test_normalize_name_handles_french_and_apostrophe_input(self):
        self.assertEqual(normalize_name("Kaédi"), normalize_name("kaedi"))
        self.assertEqual(normalize_name("Zouérat"), normalize_name("Zouerate"))
        self.assertEqual(normalize_name("Sélibaby"), normalize_name("Selibaby"))
        self.assertEqual(normalize_name("R'Kiz"), normalize_name("r kiz"))
        self.assertEqual(normalize_name("F'Derik"), normalize_name("fderik"))

    def test_city_management_tables_are_available(self):
        self.assertTrue(
            city_management_ready(),
            "cities.0005 must be applied for the management layer to operate",
        )


class CityManagementApiPermissionTests(TestCase):
    """Cases 17-18: Founder/CEO and authorized-administrator permissions."""

    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo@yala.test", is_staff=True), "CEO")
        self.admin = _in_group(_user("admin@yala.test", is_staff=True), "Operations Manager")
        self.finance = _in_group(_user("fin@yala.test", is_staff=True), "Accountant")
        self.rider = _user("rider@yala.test", user_type="rider")
        self.city, _ = ensure_city(name="Atar", region_name="Adrar")

    def test_ceo_can_view_the_city_management_registry(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["capabilities"]["can_manage"])
        self.assertTrue(response.data["capabilities"]["can_ceo_actions"])
        self.assertIn("regions", response.data)

    def test_authorized_administrator_can_view_but_not_open_live_operations(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["capabilities"]["can_manage"])
        self.assertFalse(response.data["capabilities"]["can_ceo_actions"])

        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        live = self.client.post(
            _detail_url(self.city.pk, "live/"), {"is_live": True}, format="json"
        )
        self.assertEqual(live.status_code, 403)

    def test_read_only_executive_role_cannot_manage_cities(self):
        self.client.force_authenticate(user=self.finance)
        self.assertEqual(self.client.get(LIST_URL).status_code, 200)
        response = self.client.post(
            _detail_url(self.city.pk, "activate/"), {}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_rider_cannot_reach_city_management(self):
        self.client.force_authenticate(user=self.rider)
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)

    def test_anonymous_cannot_reach_city_management(self):
        self.assertIn(self.client.get(LIST_URL).status_code, (401, 403))

    def test_ceo_can_add_a_city_through_the_api(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post(
            LIST_URL,
            {"name": "Nbeika", "region": "Trarza", "name_fr": "N'Béika"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["created"])
        self.assertIn("no service is live", response.data["message"].lower())

    def test_adding_the_same_city_twice_does_not_duplicate_it(self):
        self.client.force_authenticate(user=self.ceo)
        before = City.objects.filter(name__iexact="Atar").count()
        first = self.client.post(LIST_URL, {"name": "Atar", "region": "Adrar"}, format="json")
        second = self.client.post(LIST_URL, {"name": "Atar", "region": "Adrar"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.data["created"])
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(City.objects.filter(name__iexact="Atar").count(), before)

    def test_ceo_can_deactivate_and_reactivate_a_city_through_the_api(self):
        self.client.force_authenticate(user=self.ceo)
        off = self.client.post(_detail_url(self.city.pk, "deactivate/"), {}, format="json")
        self.assertEqual(off.status_code, 200)
        self.assertFalse(off.data["city"]["is_active"])

        on = self.client.post(_detail_url(self.city.pk, "activate/"), {}, format="json")
        self.assertEqual(on.status_code, 200)
        self.assertTrue(on.data["city"]["is_active"])

    def test_activating_live_pricing_requires_the_ceo(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            _detail_url(self.city.pk, "pricing/"),
            {"base_fare": "200", "activate": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_administrator_can_configure_pricing_without_activating_it(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            _detail_url(self.city.pk, "pricing/"), {"base_fare": "200"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["pricing"]["is_active"])

    def test_service_activation_and_deactivation_through_the_api(self):
        ensure_service_catalog(self.city)
        self.client.force_authenticate(user=self.admin)
        on = self.client.post(
            _detail_url(self.city.pk, "services/"),
            {"service": SERVICE_RIDER, "category": "standard", "is_active": True},
            format="json",
        )
        self.assertEqual(on.status_code, 200)
        self.assertTrue(on.data["is_active"])

        off = self.client.post(
            _detail_url(self.city.pk, "services/"),
            {"service": SERVICE_RIDER, "category": "standard", "is_active": False},
            format="json",
        )
        self.assertEqual(off.status_code, 200)
        self.assertFalse(off.data["is_active"])

    def test_administrative_changes_are_audited(self):
        from app_settings.models import PricingAuditLog

        self.client.force_authenticate(user=self.ceo)
        self.client.post(_detail_url(self.city.pk, "deactivate/"), {}, format="json")
        entries = PricingAuditLog.objects.filter(
            model_name="cities.City", object_id=str(self.city.pk)
        )
        self.assertTrue(entries.exists())
        self.assertTrue(entries.filter(action="deactivate").exists())

    def test_audit_trail_is_readable_by_the_ceo(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.get("/cities/management/audit/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("entries", response.data)

    def test_duplicate_report_is_read_only(self):
        self.client.force_authenticate(user=self.ceo)
        before = City.objects.count()
        response = self.client.get("/cities/management/duplicates/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no city", response.data["message"].lower())
        self.assertEqual(City.objects.count(), before)

    def test_city_detail_reports_services_pricing_and_performance(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.get(_detail_url(self.city.pk))
        self.assertEqual(response.status_code, 200)
        self.assertIn("services", response.data["city"])
        self.assertIn("performance", response.data["city"])
        self.assertIn("pricing", response.data)
        self.assertIn("capabilities", response.data)

    def test_performance_and_people_endpoints_are_reachable(self):
        self.client.force_authenticate(user=self.ceo)
        performance = self.client.get(_detail_url(self.city.pk, "performance/"))
        people = self.client.get(_detail_url(self.city.pk, "people/"))
        self.assertEqual(performance.status_code, 200)
        self.assertEqual(people.status_code, 200)
        self.assertIn("performance", performance.data)
        self.assertIn("drivers", people.data)


class PublicCityAvailabilityTests(TestCase):
    """Case 15: the rider/driver/delivery apps can refuse unsupported cities."""

    def setUp(self):
        self.client = APIClient()
        self.city, _ = ensure_city(name="Zouerate", region_name="Tiris Zemmour")
        ensure_service_catalog(self.city)

    def test_availability_endpoint_is_public(self):
        response = self.client.get(AVAILABLE_URL)
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.data["count"], 0)

    def test_a_new_city_is_reported_as_unavailable_for_rides(self):
        response = self.client.get(
            AVAILABLE_URL,
            {"city_id": self.city.pk, "service": SERVICE_RIDER},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["available"])
        self.assertIn("not available", response.data["message"])

    def test_a_live_city_is_reported_as_available_for_rides(self):
        set_service_active(self.city, SERVICE_RIDER, "standard", True)
        set_city_live(self.city, True)
        response = self.client.get(
            AVAILABLE_URL,
            {"city_id": self.city.pk, "service": SERVICE_RIDER, "category": "standard"},
        )
        self.assertTrue(response.data["available"])
        self.assertIn("available", response.data["message"])

    def test_availability_reflects_independent_services(self):
        set_service_active(self.city, SERVICE_DELIVERY, "food", True)
        set_city_live(self.city, True)
        rides = self.client.get(
            AVAILABLE_URL, {"city_id": self.city.pk, "service": SERVICE_RIDER}
        )
        delivery = self.client.get(
            AVAILABLE_URL, {"city_id": self.city.pk, "service": SERVICE_DELIVERY}
        )
        self.assertFalse(rides.data["available"])
        self.assertTrue(delivery.data["available"])






