"""Phase 9 — CEO city reporting and security posture.

Verifies the CEO-only reporting surface: city-separated and combined statistics
for Nouakchott / Nouadhibou (rides, deliveries, revenue, commissions,
withdrawals, accounts), daily/weekly/monthly/custom periods with validation, the
protected-CEO security posture payload, and that nothing in the report path
mutates financial state.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cities.models import City, Region
from deliveries.models import Delivery
from payments.models import WalletAccount, WithdrawalRequest
from security.models import AuditLog
from taxi.rides.models import Ride

User = get_user_model()

REPORT_URL = "/operations/ceo/reports/cities/"
SECURITY_URL = "/operations/ceo/security/"


def _user(email, is_staff=False, city=None, user_type="rider"):
    return User.objects.create_user(
        email=email,
        password="pw",
        is_staff=is_staff,
        user_type=user_type,
        city=city,
    )


def _in_group(user, group_name):
    group, _ = Group.objects.get_or_create(name=group_name)
    user.groups.add(group)
    return user


class CeoReportingAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-r@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops-r@yala.test", is_staff=True), "Operations Manager")
        self.finance = _in_group(_user("fin-r@yala.test", is_staff=True), "Finance")
        self.outsider = _user("plain-r@yala.test")

    def test_reporting_endpoints_are_ceo_only(self):
        for user in (self.ops, self.finance, self.outsider):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(REPORT_URL).status_code, 403)
            self.assertEqual(self.client.get(SECURITY_URL).status_code, 403)

    def test_anonymous_is_rejected(self):
        self.assertIn(self.client.get(REPORT_URL).status_code, (401, 403))

    def test_ceo_is_allowed(self):
        self.client.force_authenticate(user=self.ceo)
        self.assertEqual(self.client.get(REPORT_URL).status_code, 200)
        self.assertEqual(self.client.get(SECURITY_URL).status_code, 200)


class CeoCityReportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-c@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.nkc, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.07, "longitude": -15.95},
        )
        ndb_region, _ = Region.objects.get_or_create(name="Dakhlet Nouadhibou")
        self.ndb, _ = City.objects.get_or_create(
            region=ndb_region,
            name="Nouadhibou",
            defaults={"latitude": 20.93, "longitude": -17.03},
        )

        # Ride.city resolves to locations.City (the Ride model declares `city`
        # twice; the later declaration shadows the earlier cities.City one), while
        # User.city is cities.City. Both are matched by NAME in the report.
        # Seed data may already contain these cities, so look up by name first
        # (the locations.City slug is globally unique).
        from locations.models import City as LocationCity
        from locations.models import Region as LocationRegion

        loc_region, _ = LocationRegion.objects.get_or_create(name="Nouakchott")
        loc_region_ndb, _ = LocationRegion.objects.get_or_create(name="Dakhlet Nouadhibou")

        self.ride_city_nkc = LocationCity.objects.filter(name__iexact="Nouakchott").first()
        if self.ride_city_nkc is None:
            self.ride_city_nkc = LocationCity.objects.create(
                region=loc_region, name="Nouakchott"
            )
        self.ride_city_ndb = LocationCity.objects.filter(name__iexact="Nouadhibou").first()
        if self.ride_city_ndb is None:
            self.ride_city_ndb = LocationCity.objects.create(
                region=loc_region_ndb, name="Nouadhibou"
            )

        self.rider_nkc = _user("rider-nkc@yala.test", city=self.nkc)
        self.rider_ndb = _user("rider-ndb@yala.test", city=self.ndb)
        self.driver = _user("driver-c@yala.test", city=self.nkc, user_type="driver")

        # Two completed rides in Nouakchott, one cancelled; one completed in Nouadhibou.
        self._ride(self.ride_city_nkc, "completed", "1000.00", "800.00")
        self._ride(self.ride_city_nkc, "completed", "500.00", "400.00")
        self._ride(self.ride_city_nkc, "cancelled", "0.00", "0.00")
        self._ride(self.ride_city_ndb, "completed", "700.00", "560.00")

        # Deliveries: one delivered in each city with a stored platform commission.
        self._delivery("Nouakchott", "delivered", "300.00", "240.00", "60.00")
        self._delivery("Nouadhibou", "delivered", "200.00", "160.00", "40.00")

        # A pending withdrawal owned by a Nouakchott driver.
        WalletAccount.objects.create(owner=self.driver, balance=Decimal("5000.00"))
        WithdrawalRequest.objects.create(
            driver=self.driver, amount=Decimal("1500.00"), status="pending"
        )

    def _ride(self, city, status, fare, earning):
        return Ride.objects.create(
            rider=self.rider_nkc,
            city=city,
            pickup="A",
            destination="B",
            pickup_lat=18.07,
            pickup_lng=-15.95,
            destination_lat=18.08,
            destination_lng=-15.96,
            status=status,
            dispatch_status="searching",
            fare=Decimal(fare),
            driver_earning=Decimal(earning),
        )

    def _delivery(self, service_city, status, fare, earning, commission):
        return Delivery.objects.create(
            customer=self.rider_nkc,
            driver=self.driver,
            service_city=service_city,
            pickup="A",
            destination="B",
            recipient_name="Recipient",
            recipient_phone="+22245000002",
            recipient_code_hash="hash",
            status=status,
            fare=Decimal(fare),
            driver_earning=Decimal(earning),
            platform_commission=Decimal(commission),
            delivered_at=timezone.now(),
        )

    def test_report_contains_both_cities_and_a_combined_block(self):
        res = self.client.get(REPORT_URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn("Nouakchott", res.data["cities"])
        self.assertIn("Nouadhibou", res.data["cities"])
        self.assertEqual(res.data["combined"]["city"], "Combined")
        self.assertEqual(len(res.data["comparison"]), 2)

    def test_per_city_ride_and_delivery_statistics(self):
        res = self.client.get(REPORT_URL, {"period": "monthly"})

        nkc = res.data["cities"]["Nouakchott"]
        self.assertEqual(nkc["rides"]["total"], 3)
        self.assertEqual(nkc["rides"]["completed"], 2)
        self.assertEqual(nkc["rides"]["cancelled"], 1)
        self.assertEqual(Decimal(nkc["rides"]["completed_fare"]), Decimal("1500.00"))
        self.assertEqual(Decimal(nkc["rides"]["driver_earnings"]), Decimal("1200.00"))

        ndb = res.data["cities"]["Nouadhibou"]
        self.assertEqual(ndb["rides"]["total"], 1)
        self.assertEqual(Decimal(ndb["rides"]["completed_fare"]), Decimal("700.00"))
        self.assertEqual(ndb["deliveries"]["delivered"], 1)

    def test_revenue_and_commissions_are_separated_and_combined(self):
        res = self.client.get(REPORT_URL, {"period": "monthly"})

        nkc = res.data["cities"]["Nouakchott"]
        # Rides 1500 + deliveries 300 = 1800
        self.assertEqual(Decimal(nkc["revenue"]["total_fare"]), Decimal("1800.00"))
        self.assertEqual(
            Decimal(nkc["commissions"]["deliveries_platform_commission"]),
            Decimal("60.00"),
        )
        self.assertFalse(nkc["commissions"]["rides_platform_commission_tracked"])

        combined = res.data["combined"]
        # 1800 (NKC) + 700 rides + 200 deliveries (NDB) = 2700
        self.assertEqual(Decimal(combined["revenue"]["total_fare"]), Decimal("2700.00"))
        self.assertEqual(
            Decimal(combined["commissions"]["deliveries_platform_commission"]),
            Decimal("100.00"),
        )

    def test_withdrawals_are_reported_per_city(self):
        res = self.client.get(REPORT_URL, {"period": "monthly"})

        nkc_withdrawals = res.data["cities"]["Nouakchott"]["withdrawals"]
        self.assertEqual(nkc_withdrawals["total"], 1)
        self.assertEqual(nkc_withdrawals["pending"], 1)
        self.assertEqual(Decimal(nkc_withdrawals["pending_amount"]), Decimal("1500.00"))
        self.assertEqual(res.data["cities"]["Nouadhibou"]["withdrawals"]["total"], 0)

    def test_accounts_block_reports_population(self):
        res = self.client.get(REPORT_URL, {"period": "monthly"})
        accounts = res.data["cities"]["Nouakchott"]["accounts"]
        self.assertEqual(accounts["riders"], 1)
        self.assertIn("couriers", accounts)
        self.assertGreaterEqual(res.data["combined"]["accounts"]["active"], 3)


    def test_periods_and_custom_range_validation(self):
        for period in ("daily", "weekly", "monthly"):
            res = self.client.get(REPORT_URL, {"period": period})
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data["period"], period)

        self.assertEqual(self.client.get(REPORT_URL, {"period": "yearly"}).status_code, 400)
        self.assertEqual(self.client.get(REPORT_URL, {"period": "custom"}).status_code, 400)
        self.assertEqual(
            self.client.get(
                REPORT_URL, {"period": "custom", "date_from": "2026-13-01"}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(
                REPORT_URL,
                {"period": "custom", "date_from": "2026-03-10", "date_to": "2026-03-01"},
            ).status_code,
            400,
        )

        ok = self.client.get(
            REPORT_URL,
            {"period": "custom", "date_from": "2020-01-01", "date_to": "2030-01-01"},
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["range"], {"from": "2020-01-01", "to": "2030-01-01"})

    def test_city_subset_parameter(self):
        res = self.client.get(REPORT_URL, {"cities": "Nouadhibou"})
        self.assertEqual(list(res.data["cities"].keys()), ["Nouadhibou"])
        self.assertEqual(len(res.data["comparison"]), 1)

    def test_report_declares_utc_window_for_remote_use(self):
        res = self.client.get(REPORT_URL)
        self.assertIn("UTC", res.data["timezone_note"])
        self.assertIn("read_only", res.data["notes"])

    def test_report_never_mutates_financial_state(self):
        withdrawal = WithdrawalRequest.objects.first()
        before = (
            withdrawal.status,
            withdrawal.approved_at,
            withdrawal.paid_at,
            WalletAccount.objects.first().balance,
        )

        self.client.get(REPORT_URL, {"period": "monthly"})
        self.client.get(REPORT_URL, {"period": "custom", "date_from": "2020-01-01"})

        withdrawal.refresh_from_db()
        after = (
            withdrawal.status,
            withdrawal.approved_at,
            withdrawal.paid_at,
            WalletAccount.objects.first().balance,
        )
        self.assertEqual(before, after)


class CeoSecurityPostureTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-s@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

    def test_posture_reports_protected_ceo_authority(self):
        res = self.client.get(SECURITY_URL)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["account"]["is_ceo_authority"])
        self.assertIn("CEO", res.data["account"]["protected_groups"])
        self.assertTrue(res.data["protected_permissions"]["ceo_only_endpoints"])
        self.assertTrue(res.data["audit_trail_available"])
        self.assertGreaterEqual(
            len(res.data["protected_permissions"]["cannot_be_modified_by_subordinates"]), 4
        )

    def test_posture_reports_totp_status(self):
        res = self.client.get(SECURITY_URL)
        self.assertFalse(res.data["strong_authentication"]["totp_enrolled"])
        self.assertFalse(res.data["strong_authentication"]["totp_confirmed"])

        from admin_2fa.models import AdminTOTP

        AdminTOTP.objects.create(user=self.ceo, secret="SECRET123", is_confirmed=True)
        res2 = self.client.get(SECURITY_URL)
        self.assertTrue(res2.data["strong_authentication"]["totp_enrolled"])
        self.assertTrue(res2.data["strong_authentication"]["totp_confirmed"])

    def test_posture_counts_recent_sensitive_actions(self):
        AuditLog.objects.create(
            actor=self.ceo,
            action="suspend",
            entity_type="customer",
            entity_id="1",
            summary="Suspended a rider",
        )
        AuditLog.objects.create(
            actor=self.ceo,
            action="admin_action",
            entity_type="system",
            entity_id="broadcast",
            summary="Not a sensitive action",
        )

        res = self.client.get(SECURITY_URL)
        self.assertEqual(res.data["recent_sensitive_actions"]["count"], 1)
        self.assertEqual(res.data["recent_sensitive_actions"]["latest"][0]["action"], "suspend")

