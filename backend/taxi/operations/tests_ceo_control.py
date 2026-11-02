"""Phase 8 — CEO approvals inbox, account management and CEO audit trail.

Verifies the CEO-only surface is correctly authorized, that the approvals inbox
is read-only and correctly scoped (city filter, finance ceilings), that account
actions require a reason, refuse self/staff targets, are fully audited under the
target's domain entity, and — critically — that no financial state is touched.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from cities.models import City, Region
from payments.models import WalletAccount, WithdrawalRequest
from security.models import AuditLog

User = get_user_model()

APPROVALS_URL = "/operations/ceo/approvals/"
ACCOUNTS_URL = "/operations/ceo/accounts/"
AUDIT_URL = "/operations/ceo/audit/"


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


class CeoControlAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops@yala.test", is_staff=True), "Operations Manager")
        self.outsider = _user("plain@yala.test")

    def test_endpoints_are_ceo_only(self):
        for user in (self.ops, self.outsider):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(APPROVALS_URL).status_code, 403)
            self.assertEqual(self.client.get(ACCOUNTS_URL).status_code, 403)
            self.assertEqual(self.client.get(AUDIT_URL).status_code, 403)

    def test_anonymous_is_rejected(self):
        self.assertIn(self.client.get(ACCOUNTS_URL).status_code, (401, 403))

    def test_ceo_is_allowed(self):
        self.client.force_authenticate(user=self.ceo)
        self.assertEqual(self.client.get(APPROVALS_URL).status_code, 200)
        self.assertEqual(self.client.get(ACCOUNTS_URL).status_code, 200)
        self.assertEqual(self.client.get(AUDIT_URL).status_code, 200)


class CeoApprovalsInboxTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo2@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.07, "longitude": -15.95},
        )
        other_region, _ = Region.objects.get_or_create(name="Dakhlet Nouadhibou")
        self.other_city, _ = City.objects.get_or_create(
            region=other_region,
            name="Nouadhibou",
            defaults={"latitude": 20.93, "longitude": -17.03},
        )

        self.driver = _user("driver@yala.test", city=self.city, user_type="driver")
        self.pending_rider = _user("pending-rider@yala.test", city=self.city)
        self.pending_rider.rider_status = "pending"
        self.pending_rider.save(update_fields=["rider_status"])

        self.remote_rider = _user("remote-rider@yala.test", city=self.other_city)
        self.remote_rider.rider_status = "pending"
        self.remote_rider.save(update_fields=["rider_status"])

    def test_inbox_groups_and_counts(self):
        res = self.client.get(APPROVALS_URL)
        self.assertEqual(res.status_code, 200)
        groups = res.data["groups"]
        self.assertEqual(groups["riders"]["count"], 2)
        self.assertEqual(res.data["total_pending"], sum(g["count"] for g in groups.values()))
        self.assertTrue(res.data["financial_approvals_frozen"])

    def test_inbox_city_filter(self):
        res = self.client.get(APPROVALS_URL, {"city": "Nouadhibou"})
        self.assertEqual(res.data["groups"]["riders"]["count"], 1)
        self.assertEqual(res.data["city_filter"], "Nouadhibou")
        emails = [row["requester_email"] for row in res.data["groups"]["riders"]["items"]]
        self.assertEqual(emails, ["remote-rider@yala.test"])

    def test_inbox_lists_only_ceo_authority_withdrawals(self):
        WalletAccount.objects.create(owner=self.driver, balance=Decimal("500000.00"))
        small = WithdrawalRequest.objects.create(
            driver=self.driver, amount=Decimal("50000.00"), status="pending"
        )
        big = WithdrawalRequest.objects.create(
            driver=self.driver, amount=Decimal("250000.00"), status="pending"
        )

        res = self.client.get(APPROVALS_URL)
        ids = [row["id"] for row in res.data["groups"]["withdrawals"]["items"]]
        self.assertIn(big.id, ids)
        self.assertNotIn(small.id, ids)
        self.assertEqual(res.data["groups"]["withdrawals"]["count"], 1)

    def test_inbox_never_mutates_financial_state(self):
        WalletAccount.objects.create(owner=self.driver, balance=Decimal("500000.00"))
        withdrawal = WithdrawalRequest.objects.create(
            driver=self.driver, amount=Decimal("250000.00"), status="pending"
        )

        self.client.get(APPROVALS_URL)
        self.client.get(APPROVALS_URL, {"city": "Nouakchott"})

        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "pending")
        self.assertIsNone(withdrawal.approved_at)
        self.assertIsNone(withdrawal.paid_at)


class CeoAccountManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo3@yala.test", is_staff=True), "CEO")
        self.other_ceo = _in_group(_user("ceo4@yala.test", is_staff=True), "CEO")
        self.rider = _user("target-rider@yala.test")
        self.client.force_authenticate(user=self.ceo)

    def test_directory_lists_accounts_and_marks_actionable(self):
        res = self.client.get(ACCOUNTS_URL)
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.data["results"] if r["id"] == self.rider.id)
        self.assertTrue(row["actionable"])
        self.assertEqual(row["domain"], "rider")

        staff_row = next(r for r in res.data["results"] if r["id"] == self.ceo.id)
        self.assertFalse(staff_row["actionable"])
        self.assertEqual(staff_row["domain"], "staff")

    def test_directory_search_and_domain_filters(self):
        self.assertEqual(
            self.client.get(ACCOUNTS_URL, {"search": "target-rider"}).data["count"], 1
        )
        self.assertEqual(self.client.get(ACCOUNTS_URL, {"domain": "rider"}).data["count"], 3)
        self.assertEqual(self.client.get(ACCOUNTS_URL, {"domain": "staff"}).data["count"], 2)

    def test_suspend_requires_a_meaningful_reason(self):
        url = f"{ACCOUNTS_URL}{self.rider.id}/action/"
        res = self.client.post(url, {"action": "suspend", "reason": "no"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.rider.refresh_from_db()
        self.assertTrue(self.rider.is_active)

    def test_suspend_deactivates_and_audits_under_domain_entity(self):
        url = f"{ACCOUNTS_URL}{self.rider.id}/action/"
        res = self.client.post(
            url,
            {"action": "suspend", "reason": "Fraud investigation opened"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.rider.refresh_from_db()
        self.assertFalse(self.rider.is_active)
        self.assertEqual(res.data["domain"], "rider")

        log = AuditLog.objects.filter(
            entity_type="customer", entity_id=str(self.rider.id)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, "suspend")
        self.assertEqual(log.details.get("reason"), "Fraud investigation opened")
        self.assertEqual(log.details.get("previous_state"), "active")
        self.assertEqual(log.details.get("new_state"), "inactive")
        self.assertEqual(log.details.get("source"), "ceo_control")

    def test_reactivate_restores_access_and_audits(self):
        self.rider.is_active = False
        self.rider.save(update_fields=["is_active"])

        res = self.client.post(
            f"{ACCOUNTS_URL}{self.rider.id}/action/",
            {"action": "reactivate", "reason": "Investigation cleared"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.rider.refresh_from_db()
        self.assertTrue(self.rider.is_active)
        self.assertTrue(
            AuditLog.objects.filter(
                entity_type="customer", entity_id=str(self.rider.id), action="reactivate"
            ).exists()
        )

    def test_cannot_target_self(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.ceo.id}/action/",
            {"action": "suspend", "reason": "Should be refused"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.ceo.refresh_from_db()
        self.assertTrue(self.ceo.is_active)

    def test_cannot_target_staff_or_another_ceo(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.other_ceo.id}/action/",
            {"action": "suspend", "reason": "Should be refused"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.other_ceo.refresh_from_db()
        self.assertTrue(self.other_ceo.is_active)

    def test_cannot_target_superuser(self):
        root = _user("root@yala.test", is_staff=True, is_superuser=True)
        res = self.client.post(
            f"{ACCOUNTS_URL}{root.id}/action/",
            {"action": "block", "reason": "Should be refused"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_invalid_and_repeat_actions_are_rejected(self):
        url = f"{ACCOUNTS_URL}{self.rider.id}/action/"
        invalid = self.client.post(
            url, {"action": "delete", "reason": "nope nope"}, format="json"
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("suspend", invalid.data["valid_actions"])

        first = self.client.post(
            url, {"action": "suspend", "reason": "Valid reason"}, format="json"
        )
        self.assertEqual(first.status_code, 200)
        # Already inactive -> 400, never a silent no-op.
        repeat = self.client.post(
            url, {"action": "suspend", "reason": "Again again"}, format="json"
        )
        self.assertEqual(repeat.status_code, 400)

    def test_account_action_never_touches_financial_state(self):
        wallet = WalletAccount.objects.create(owner=self.rider, balance=Decimal("1200.00"))
        before_balance = wallet.balance

        self.client.post(
            f"{ACCOUNTS_URL}{self.rider.id}/action/",
            {"action": "suspend", "reason": "Compliance review"},
            format="json",
        )

        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, before_balance)
        self.assertEqual(WalletAccount.objects.count(), 1)


class CeoAuditTrailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo5@yala.test", is_staff=True), "CEO")
        self.other = _in_group(_user("ops5@yala.test", is_staff=True), "Operations Manager")
        self.target = _user("audit-target@yala.test")
        self.client.force_authenticate(user=self.ceo)

        self.client.post(
            f"{ACCOUNTS_URL}{self.target.id}/action/",
            {"action": "suspend", "reason": "Audit trail check"},
            format="json",
        )

    def test_scope_me_returns_only_the_ceos_actions(self):
        res = self.client.get(AUDIT_URL, {"scope": "me"})
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data["count"], 1)
        self.assertTrue(
            all(row["actor_email"] == "ceo5@yala.test" for row in res.data["results"])
        )
        self.assertEqual(res.data["results"][0]["reason"], "Audit trail check")

    def test_scope_all_includes_other_actors_without_ip(self):
        AuditLog.objects.create(
            actor=self.other,
            action="status_change",
            entity_type="customer",
            entity_id="999",
            summary="Ops changed a status",
            details={"operation": "suspend"},
            ip_address="10.0.0.9",
        )
        res = self.client.get(AUDIT_URL, {"scope": "all"})
        emails = {row["actor_email"] for row in res.data["results"]}
        self.assertIn("ops5@yala.test", emails)
        self.assertTrue(all(row["ip_address"] is None for row in res.data["results"]))

    def test_invalid_date_returns_400(self):
        self.assertEqual(
            self.client.get(AUDIT_URL, {"date_from": "not-a-date"}).status_code, 400
        )

    def test_limit_is_clamped(self):
        res = self.client.get(AUDIT_URL, {"limit": "1"})
        self.assertLessEqual(len(res.data["results"]), 1)
