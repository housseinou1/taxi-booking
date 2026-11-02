"""Task 8 — city assignment foundation and disabled Delivery city scoping (throwaway test DB).

1. multi_city_permissions: user.city (cities.City) is translated to locations.City ids.
2. /operations/city-assignments/ API: CEO-only, validated, audited, soft revoke.
3. deliveries.city_scope: "off" changes nothing; "shadow" changes nothing but logs;
   "enforce" scopes national / assigned-city / unassigned staff correctly.
"""
import itertools
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from authapp.models import User
from cities.models import City as UserCity, Region as UserRegion
from deliveries.city_scope import delivery_city_map, filter_courier_settings, get_delivery_scope
from deliveries.models import Delivery, DriverDeliverySettings
from locations.models import City as LocationCity, Region as LocationRegion
from operations.city_assignment_models import StaffCityAssignment
from operations.multi_city_permissions import get_user_city_ids, location_city_id_for_user
from security.models import AuditLog

_n = itertools.count(1)
API = "/operations/city-assignments/"
DIRECTORY = "/deliveries/admin/deliveries/"
CITIES = "/deliveries/admin/analytics/cities/"


def make_user(kind, groups=(), **extra):
    n = next(_n)
    user = User.objects.create_user(
        email=f"t8-{kind}{n}@example.com", password="x-Strong-Pass-1", first_name=kind.title(),
        last_name=f"N{n}", phone_number=f"+22299{n:06d}", national_id_number=f"99{n:08d}", **extra,
    )
    for name in groups:
        user.groups.add(Group.objects.get_or_create(name=name)[0])
    return user


class CityFixture:
    @classmethod
    def setUpTestData(cls):
        # Two different city tables. The test DB is seeded by data migrations, so existing rows
        # are reused and only missing ones are created (with explicit unique slugs).
        cls.loc_nkc = cls._location_city("Nouakchott", "Nouakchott")
        cls.loc_ndb = cls._location_city("Nouadhibou", "Dakhlet Nouadhibou")
        cls.user_nkc = cls._user_city("Nouakchott", cls.loc_nkc.region.name)
        cls.user_ndb = cls._user_city("Nouadhibou", cls.loc_ndb.region.name)
        cls.user_orphan = cls._user_city("Nowhere Town", cls.loc_nkc.region.name)
        # The translation tests are only meaningful when the two tables disagree on an id.
        if cls.user_ndb.id == cls.loc_ndb.id:
            cls.user_ndb = cls._user_city("Nouadhibou", cls.loc_ndb.region.name, force_new=True)
        assert cls.user_ndb.id != cls.loc_ndb.id, "fixture must give Nouadhibou different ids"

    @staticmethod
    def _location_city(name, region_name):
        existing = LocationCity.objects.filter(name=name).select_related("region")
        if existing.count() == 1:
            return existing.first()
        region = LocationRegion.objects.filter(name=region_name).first() or LocationRegion.objects.create(
            name=region_name, slug=f"t8-{region_name.lower().replace(' ', '-')}")
        return LocationCity.objects.create(region=region, name=name, slug=f"t8-{name.lower().replace(' ', '-')}")

    @staticmethod
    def _user_city(name, region_name, force_new=False):
        region = UserRegion.objects.filter(name=region_name).first() or UserRegion.objects.create(name=region_name)
        if not force_new:
            found = UserCity.objects.filter(name=name, region=region).first()
            if found:
                return found
        # Padding row so the new id cannot coincide with the locations id.
        UserCity.objects.create(region=region, name=f"T8 padding {UserCity.objects.count()}")
        return UserCity.objects.create(region=region, name=name if not force_new else name)


class CityIdTranslationTests(CityFixture, TestCase):
    def test_home_city_is_translated_to_the_locations_table(self):
        ops = make_user("ops", ["Operations Manager"], is_staff=True, city=self.user_nkc)
        self.assertEqual(location_city_id_for_user(ops), self.loc_nkc.id)
        self.assertEqual(get_user_city_ids(ops, "operations"), [self.loc_nkc.id])
        self.assertNotIn(self.user_nkc.id, get_user_city_ids(ops, "operations") if self.user_nkc.id != self.loc_nkc.id else [])

    def test_finance_scope_uses_translated_id(self):
        fin = make_user("fin", ["Finance"], is_staff=True, city=self.user_ndb)
        self.assertEqual(get_user_city_ids(fin, "finance"), [self.loc_ndb.id])

    def test_unmatched_or_ambiguous_city_grants_nothing(self):
        ops = make_user("ops", ["Operations Manager"], is_staff=True, city=self.user_orphan)
        self.assertIsNone(location_city_id_for_user(ops))
        self.assertEqual(get_user_city_ids(ops, "operations"), [])
        LocationCity.objects.create(region=self.loc_nkc.region, name="nouakchott", slug="t8-ambiguous")  # ambiguous now
        ops2 = make_user("ops", ["Operations Manager"], is_staff=True, city=self.user_nkc)
        self.assertIsNone(location_city_id_for_user(ops2))

    def test_national_access_unchanged(self):
        ceo = make_user("ceo", ["CEO"], is_staff=True, city=self.user_nkc)
        self.assertIsNone(get_user_city_ids(ceo))
        superuser = make_user("su", is_staff=True, is_superuser=True)
        self.assertIsNone(get_user_city_ids(superuser))


class AssignmentApiTests(CityFixture, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = make_user("ceo", ["CEO"], is_staff=True)
        self.ops = make_user("ops", ["Operations Manager"], is_staff=True)
        self.support = make_user("support", ["Support"], is_staff=True)
        self.hr = make_user("hr", ["HR Staff"], is_staff=True)
        self.rider = make_user("rider")

    def create(self, user=None, actor=None, **body):
        self.client.force_authenticate(actor or self.ceo)
        payload = {"user_id": (user or self.ops).id, "city_id": self.loc_nkc.id, "role": "operations_manager", **body}
        return self.client.post(API, payload, format="json")

    def test_ceo_creates_assignment_and_it_is_audited(self):
        before = AuditLog.objects.count()
        r = self.create(notes="Pilot city")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["user_id"], r.data["city_id"], r.data["role"], r.data["is_active"]),
                         (self.ops.id, self.loc_nkc.id, "operations_manager", True))
        self.assertEqual(r.data["assigned_by_id"], self.ceo.id)
        log = AuditLog.objects.order_by("-id").first()
        self.assertEqual(AuditLog.objects.count(), before + 1)
        self.assertEqual((log.actor_id, log.entity_id), (self.ceo.id, f"city_assignment:{r.data['id']}"))

    def test_only_national_roles_may_manage_assignments(self):
        superuser = make_user("su", is_staff=True, is_superuser=True)
        self.assertEqual(self.create(actor=superuser).status_code, 201)
        for actor in (self.ops, self.support, self.hr, self.rider):
            with self.subTest(actor=actor.email):
                self.assertEqual(self.create(actor=actor, user=self.support, role="support").status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(API).status_code, (401, 403))
        self.assertIn(self.client.post(API, {}, format="json").status_code, (401, 403))

    def test_validation(self):
        cases = [
            (dict(user=self.rider), "not_active_staff"),
            (dict(user=self.hr), "role_group_mismatch"),
            (dict(user=self.ops, role="support"), "role_group_mismatch"),
            (dict(user=self.ceo), "national_access_user"),
            (dict(role="mayor"), "invalid_role"),
            (dict(city_id=987654), "city_not_found"),
            (dict(city_id="abc"), "invalid_parameter"),
        ]
        for kwargs, code in cases:
            with self.subTest(code=code):
                user = kwargs.pop("user", self.ops)
                self.assertEqual(self.create(user=user, **kwargs).data["code"], code)
        self.assertEqual(StaffCityAssignment.objects.count(), 0)

    def test_duplicate_active_is_conflict_and_multiple_users_allowed(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 409)
        other_ops = make_user("ops", ["Operations Manager"], is_staff=True)
        self.assertEqual(self.create(user=other_ops).status_code, 201)  # several per city
        self.assertEqual(self.create(user=self.support, role="support").status_code, 201)

    def test_revoke_is_soft_audited_and_allows_reassignment(self):
        created = self.create().data
        url = f"{API}{created['id']}/revoke/"
        self.client.force_authenticate(self.ceo)
        self.assertEqual(self.client.post(url, {"reason": "no"}, format="json").data["code"], "reason_required")
        r = self.client.post(url, {"reason": "Moved to another city"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["is_active"])
        self.assertEqual(r.data["revoked_by_id"], self.ceo.id)
        self.assertEqual(self.client.post(url, {"reason": "again please"}, format="json").status_code, 409)
        self.assertTrue(StaffCityAssignment.objects.filter(id=created["id"]).exists())  # never deleted
        self.assertEqual(self.create().status_code, 201)  # can be reassigned after revoke
        self.client.force_authenticate(self.ops)
        self.assertEqual(self.client.post(url, {"reason": "not allowed"}, format="json").status_code, 403)

    def test_list_filters(self):
        a = self.create().data
        self.create(user=self.support, role="support", city_id=self.loc_ndb.id)
        self.client.force_authenticate(self.ceo)
        self.client.post(f"{API}{a['id']}/revoke/", {"reason": "rotation"}, format="json")
        self.assertEqual(len(self.client.get(API).data["results"]), 1)
        self.assertEqual(len(self.client.get(API, {"include_inactive": "true"}).data["results"]), 2)
        self.assertEqual(len(self.client.get(API, {"city_id": self.loc_ndb.id}).data["results"]), 1)
        self.assertEqual(self.client.get(API, {"role": "boss"}).status_code, 400)

    def test_my_scope_endpoint(self):
        self.create()
        self.client.force_authenticate(self.ops)
        data = self.client.get(f"{API}me/").data
        self.assertEqual((data["scoping_mode"], data["national"], data["city_ids"]), ("off", False, [self.loc_nkc.id]))
        self.client.force_authenticate(self.rider)
        self.assertEqual(self.client.get(f"{API}me/").status_code, 403)


class DeliveryScopeFixture(CityFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.customer = make_user("customer")
        cls.ceo = make_user("ceo", ["CEO"], is_staff=True)
        cls.ops_nkc = make_user("ops", ["Operations Manager"], is_staff=True, city=cls.user_ndb)  # home city ignored
        cls.support_ndb = make_user("support", ["Support"], is_staff=True)
        cls.unassigned = make_user("ops", ["Operations Manager"], is_staff=True, city=cls.user_nkc)
        cls.hr = make_user("hr", ["HR Staff"], is_staff=True)
        cls.revoked = make_user("ops", ["Operations Manager"], is_staff=True)
        StaffCityAssignment.objects.create(user=cls.ops_nkc, city=cls.loc_nkc, role="operations_manager")
        StaffCityAssignment.objects.create(user=cls.support_ndb, city=cls.loc_ndb, role="support")
        StaffCityAssignment.objects.create(user=cls.revoked, city=cls.loc_nkc, role="operations_manager",
                                           is_active=False)

        def delivery(city, fare="100.00", status="delivered"):
            return Delivery.objects.create(
                customer=cls.customer, pickup="P", destination="D", recipient_name="R",
                recipient_phone="+22200000000", recipient_code_hash="h", status=status,
                service_city=city, fare=Decimal(fare),
            )

        cls.d_nkc = [delivery("Nouakchott"), delivery("Nouakchott", "50.00", "cancelled")]
        cls.d_ndb = delivery("Nouadhibou", "70.00")
        cls.d_unmapped = delivery("nouakchott ", "10.00")  # not the exact canonical text


class DeliveryScopeOffAndShadowTests(DeliveryScopeFixture, TestCase):
    def setUp(self):
        self.client = APIClient()

    def counts(self, user):
        self.client.force_authenticate(user)
        return self.client.get(DIRECTORY).status_code, self.client.get(DIRECTORY).data.get("count")

    def test_off_by_default_everyone_staff_keeps_todays_access(self):
        for user in (self.ceo, self.ops_nkc, self.support_ndb, self.unassigned, self.hr, self.revoked):
            with self.subTest(user=user.email):
                self.assertEqual(self.counts(user), (200, 4))

    @override_settings(DELIVERY_CITY_SCOPING="shadow")
    def test_shadow_changes_nothing_but_logs(self):
        with self.assertLogs("yala.city_scope", level="WARNING") as logs:
            self.assertEqual(self.counts(self.ops_nkc), (200, 4))
            self.assertEqual(self.counts(self.hr), (200, 4))
            self.client.force_authenticate(self.support_ndb)
            self.assertEqual(self.client.get(f"{DIRECTORY}{self.d_nkc[0].id}/").status_code, 200)
        text = "\n".join(logs.output)
        self.assertIn("would_hide=2", text)  # ops_nkc would not see Nouadhibou + unmapped
        self.assertIn("would_deny=1", text)

    @override_settings(DELIVERY_CITY_SCOPING="nonsense")
    def test_unknown_mode_is_treated_as_off(self):
        self.assertEqual(self.counts(self.hr), (200, 4))


@override_settings(DELIVERY_CITY_SCOPING="enforce")
class DeliveryScopeEnforceTests(DeliveryScopeFixture, TestCase):
    def setUp(self):
        self.client = APIClient()

    def get(self, user, url, **params):
        self.client.force_authenticate(user)
        return self.client.get(url, params)

    def test_mapping_is_exact_and_deterministic(self):
        from deliveries.cities import normalize_city_name

        mapping = delivery_city_map()
        self.assertEqual(mapping["Nouakchott"], self.loc_nkc.id)
        self.assertEqual(mapping["Nouadhibou"], self.loc_ndb.id)
        self.assertEqual(mapping, delivery_city_map())  # stable across calls
        for canonical, city_id in mapping.items():
            self.assertEqual(normalize_city_name(LocationCity.objects.get(id=city_id).name), canonical)
        self.assertNotIn("nouakchott ", mapping)
        # A second locations.City normalising to the same name makes it ambiguous -> unmapped.
        LocationCity.objects.create(region=self.loc_ndb.region, name="NOUADHIBOU", slug="t8-ndb-dup")
        self.assertNotIn("Nouadhibou", delivery_city_map())

    def test_national_sees_everything_including_unmapped(self):
        self.assertEqual(self.get(self.ceo, DIRECTORY).data["count"], 4)

    def test_assigned_city_staff_see_only_their_city(self):
        data = self.get(self.ops_nkc, DIRECTORY).data
        self.assertEqual({row["id"] for row in data["results"]}, {d.id for d in self.d_nkc})
        self.assertEqual(data["summary"]["delivered_revenue"], "100.00")  # no leakage from other cities
        self.assertEqual(self.get(self.support_ndb, DIRECTORY).data["count"], 1)

    def test_other_city_detail_and_tracking_are_denied(self):
        for url in (f"{DIRECTORY}{self.d_ndb.id}/", f"{DIRECTORY}{self.d_ndb.id}/tracking/",
                    f"{DIRECTORY}{self.d_unmapped.id}/"):
            with self.subTest(url=url):
                r = self.get(self.ops_nkc, url)
                self.assertEqual((r.status_code, r.data["code"]), (403, "city_access_denied"))
        self.assertEqual(self.get(self.ops_nkc, f"{DIRECTORY}{self.d_nkc[0].id}/tracking/").status_code, 200)

    def test_unassigned_hr_and_revoked_staff_are_denied_never_national(self):
        for user in (self.unassigned, self.hr, self.revoked):
            for url in (DIRECTORY, CITIES, f"{DIRECTORY}{self.d_nkc[0].id}/"):
                with self.subTest(user=user.email, url=url):
                    self.assertEqual(self.get(user, url).status_code, 403)

    def test_home_city_is_not_an_assignment(self):
        # ops_nkc's home city is Nouadhibou, but only the explicit Nouakchott assignment counts.
        scope = get_delivery_scope(self.ops_nkc)
        self.assertEqual(scope.city_ids, frozenset({self.loc_nkc.id}))

    def test_city_analytics_is_scoped(self):
        data = self.get(self.ops_nkc, CITIES).data
        self.assertEqual([row["service_city"] for row in data["cities"]], ["Nouakchott"])
        self.assertEqual(data["totals"]["delivered_revenue"], "100.00")
        self.assertEqual(len(self.get(self.ceo, CITIES).data["cities"]), 3)

    def test_courier_filter_by_served_cities(self):
        couriers = []
        for cities in (["Nouakchott"], ["nouadhibou"], ["Nouakchott", "Nouadhibou"], []):
            user = make_user("courier", user_type="driver")
            couriers.append(DriverDeliverySettings.objects.create(driver=user, delivery_cities=cities))
        ids = set(filter_courier_settings(DriverDeliverySettings.objects.all(),
                                          get_delivery_scope(self.support_ndb)).values_list("id", flat=True))
        self.assertEqual(ids, {couriers[1].id, couriers[2].id})
