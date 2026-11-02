"""Phase 11 — Security Operations Center tests.

Verifies the CEO-tier read-only console: access control, the posture overview,
the filterable audit stream (including the malformed-date 400 regression), the
administrative access review (protected accounts, TOTP gaps, stale logins), and
the server-computed outstanding-issues register — which must keep the public QR
feature reported as NOT activated and the PDF card feature reported as blocked
while the dependency is missing.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from security.models import AuditLog, FraudFlag

User = get_user_model()

OVERVIEW_URL = "/security/admin/console/overview/"
AUDIT_URL = "/security/admin/console/audit-stream/"
ACCESS_URL = "/security/admin/console/access-review/"
ISSUES_URL = "/security/admin/console/outstanding-issues/"


def _user(email, is_staff=False, is_superuser=False):
    return User.objects.create_user(
        email=email, password="pw", is_staff=is_staff, is_superuser=is_superuser
    )


def _in_group(user, group_name):
    group, _ = Group.objects.get_or_create(name=group_name)
    user.groups.add(group)
    return user


class SecurityConsoleAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-sec@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops-sec@yala.test", is_staff=True), "Operations Manager")
        self.plain = _user("plain-sec@yala.test")

    def test_all_console_endpoints_are_ceo_tier_only(self):
        for user in (self.ops, self.plain):
            self.client.force_authenticate(user=user)
            for url in (OVERVIEW_URL, AUDIT_URL, ACCESS_URL, ISSUES_URL):
                self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_anonymous_is_rejected(self):
        self.client.force_authenticate(user=None)
        for url in (OVERVIEW_URL, AUDIT_URL, ACCESS_URL, ISSUES_URL):
            self.assertIn(self.client.get(url).status_code, (401, 403), url)

    def test_console_is_read_only(self):
        self.client.force_authenticate(user=self.ceo)
        for url in (OVERVIEW_URL, AUDIT_URL, ACCESS_URL, ISSUES_URL):
            self.assertEqual(self.client.post(url, {}, format="json").status_code, 405, url)
            self.assertEqual(self.client.delete(url).status_code, 405, url)


class SecurityOverviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-ov@yala.test", is_staff=True), "CEO")
        self.rider = _user("rider-ov@yala.test")
        self.client.force_authenticate(user=self.ceo)

        AuditLog.objects.create(
            actor=self.ceo,
            action="admin_action",
            entity_type="system",
            entity_id="user:9",
            summary="Account suspended",
        )
        AuditLog.objects.create(
            actor=self.ceo,
            action="document_approval",
            entity_type="document",
            entity_id="42",
            summary="Document approved",
        )
        FraudFlag.objects.create(user=self.rider, reason="other", status="open")
        FraudFlag.objects.create(user=self.rider, reason="other", status="reviewed")

    def test_overview_reports_real_counts(self):
        res = self.client.get(OVERVIEW_URL)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["audit"]["total"], 2)
        self.assertEqual(res.data["audit"]["last_24h"], 2)
        self.assertEqual(res.data["audit"]["high_risk_last_7d"], 1)
        self.assertEqual(res.data["fraud"]["total"], 2)
        self.assertEqual(
            {row["status"] for row in res.data["fraud"]["by_status"]}, {"open", "reviewed"}
        )
        self.assertEqual(res.data["administrators"]["staff"], 1)
        self.assertTrue(res.data["read_only"])
        self.assertIn("protected_groups", res.data["protection"])

    def test_overview_top_actions_are_grouped(self):
        res = self.client.get(OVERVIEW_URL)
        actions = {row["action"]: row["total"] for row in res.data["audit"]["top_actions_7d"]}
        self.assertEqual(actions["admin_action"], 1)
        self.assertEqual(actions["document_approval"], 1)

    def test_overview_counts_admins_without_strong_auth(self):
        res = self.client.get(OVERVIEW_URL)
        self.assertEqual(res.data["administrators"]["without_totp"], 1)


class SecurityAuditStreamTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-stream@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)
        self.old = AuditLog.objects.create(
            actor=self.ceo,
            action="refund",
            entity_type="refund",
            entity_id="1001",
            summary="Refund issued",
        )
        AuditLog.objects.update_or_create(
            pk=self.old.pk, defaults={"created_at": timezone.now() - timedelta(days=30)}
        )
        AuditLog.objects.create(
            actor=self.ceo,
            action="admin_action",
            entity_type="system",
            entity_id="user:7",
            summary="Admin role changed for support@yala.test",
        )

    def test_stream_is_paginated_and_newest_first(self):
        res = self.client.get(AUDIT_URL, {"page_size": 1})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(res.data["total_pages"], 2)
        self.assertEqual(res.data["results"][0]["action"], "admin_action")
        self.assertTrue(res.data["results"][0]["high_risk"])

    def test_stream_filters_by_action_entity_and_search(self):
        self.assertEqual(self.client.get(AUDIT_URL, {"action": "refund"}).data["count"], 1)
        self.assertEqual(self.client.get(AUDIT_URL, {"entity_type": "system"}).data["count"], 1)
        self.assertEqual(self.client.get(AUDIT_URL, {"entity_id": "1001"}).data["count"], 1)
        self.assertEqual(
            self.client.get(AUDIT_URL, {"search": "role changed"}).data["count"], 1
        )
        self.assertEqual(
            self.client.get(AUDIT_URL, {"actor": "ceo-stream"}).data["count"], 2
        )

    def test_stream_date_range_filters(self):
        today = timezone.localdate().isoformat()
        res = self.client.get(AUDIT_URL, {"date_from": today, "date_to": today})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["action"], "admin_action")

    def test_malformed_dates_return_400_never_500(self):
        for param in ("date_from", "date_to"):
            res = self.client.get(AUDIT_URL, {param: "2026-13-01"})
            self.assertEqual(res.status_code, 400, param)
            self.assertIn("Invalid", res.data["detail"])

    def test_existing_audit_logs_endpoint_also_returns_400(self):
        """Regression: the pre-existing endpoint raised ValueError → 500."""
        res = self.client.get("/security/admin/audit-logs/", {"date_from": "2026-13-01"})
        self.assertEqual(res.status_code, 400)



class SecurityAccessReviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("founder-sec@yala.test", is_staff=True), "CEO")
        self.never = _in_group(_user("never-login@yala.test", is_staff=True), "Support")
        self.stale = _in_group(_user("stale-login@yala.test", is_staff=True), "Finance")
        User.objects.filter(pk=self.stale.pk).update(
            last_login=timezone.now() - timedelta(days=120)
        )
        self.root = _user("root-sec@yala.test", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=self.ceo)

    def test_review_flags_protected_accounts_and_auth_gaps(self):
        res = self.client.get(ACCESS_URL)

        self.assertEqual(res.status_code, 200)
        rows = {row["email"]: row for row in res.data["results"]}
        self.assertTrue(rows["founder-sec@yala.test"]["protected"])
        self.assertIn("no_totp", rows["founder-sec@yala.test"]["flags"])
        self.assertIn("never_logged_in", rows["never-login@yala.test"]["flags"])
        self.assertIn("stale_login", rows["stale-login@yala.test"]["flags"])
        self.assertTrue(rows["root-sec@yala.test"]["is_superuser"])
        self.assertEqual(res.data["summary"]["protected"], 2)  # CEO group + superuser
        self.assertTrue(res.data["read_only"])

    def test_review_flag_filter_and_search(self):
        only_never = self.client.get(ACCESS_URL, {"flag": "never_logged_in"})
        rows = only_never.data["results"]
        self.assertTrue(rows)
        for row in rows:
            self.assertIn("never_logged_in", row["flags"])
        self.assertIn("never-login@yala.test", [row["email"] for row in rows])

        searched = self.client.get(ACCESS_URL, {"search": "stale-login"})
        self.assertEqual(searched.data["count"], 1)

    def test_review_reports_days_since_login(self):
        res = self.client.get(ACCESS_URL, {"flag": "stale_login"})
        self.assertGreaterEqual(res.data["results"][0]["days_since_login"], 119)
        self.assertEqual(res.data["stale_login_days"], 90)


class OutstandingIssuesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-issues@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

    def test_register_covers_the_tracked_items(self):
        res = self.client.get(ISSUES_URL)

        self.assertEqual(res.status_code, 200)
        ids = {item["id"] for item in res.data["items"]}
        self.assertEqual(
            ids,
            {
                "css-order-build-warnings",
                "employee-pdf-id-cards",
                "public-qr-verification",
                "cashless-policy",
                "payment-providers",
                "pending-migrations",
            },
        )
        self.assertEqual(res.data["blocking_count"], 0)
        self.assertFalse(res.data["financial_activation"])
        self.assertFalse(res.data["public_qr_activation"])
        self.assertTrue(res.data["read_only"])

    def test_public_qr_is_reported_as_implemented_but_not_activated(self):
        res = self.client.get(ISSUES_URL)
        qr = next(item for item in res.data["items"] if item["id"] == "public-qr-verification")

        self.assertEqual(qr["status"], "blocked_by_design")
        checks = {check["name"]: check for check in qr["checks"]}
        self.assertTrue(checks["public_route_registered"]["ok"])
        self.assertTrue(checks["activation_disabled_by_default"]["ok"])
        self.assertTrue(checks["verification_record_writer"]["ok"])
        self.assertTrue(checks["retention_purge_command"]["ok"])
        self.assertTrue(checks["signed_verification_tokens"]["ok"])
        self.assertTrue(checks["token_revocation_and_expiry"]["ok"])
        self.assertTrue(checks["token_cleanup_command"]["ok"])

    def test_pdf_item_reports_the_shipped_endpoint(self):
        res = self.client.get(ISSUES_URL)
        pdf = next(item for item in res.data["items"] if item["id"] == "employee-pdf-id-cards")
        checks = {check["name"]: check for check in pdf["checks"]}
        if checks["reportlab_installed"]["ok"] and checks["pdf_endpoint_registered"]["ok"]:
            self.assertEqual(pdf["status"], "shipped")
        else:
            self.assertEqual(pdf["status"], "blocked_dependency")

    def test_cashless_and_provider_items_are_tracked(self):
        res = self.client.get(ISSUES_URL)
        cashless = next(item for item in res.data["items"] if item["id"] == "cashless-policy")
        providers = next(item for item in res.data["items"] if item["id"] == "payment-providers")

        self.assertEqual(cashless["status"], "enforced")
        cashless_checks = {check["name"]: check for check in cashless["checks"]}
        self.assertTrue(cashless_checks["policy_enforced"]["ok"])
        self.assertTrue(cashless_checks["open_touchpoints"]["ok"])

        self.assertEqual(providers["status"], "mock_adapters_active")
        provider_checks = {check["name"]: check for check in providers["checks"]}
        self.assertTrue(provider_checks["live_mode_disabled"]["ok"])
        self.assertTrue(provider_checks["mock_adapters_labelled"]["ok"])

    def test_css_item_reports_the_ci_workaround(self):
        res = self.client.get(ISSUES_URL)
        css = next(item for item in res.data["items"] if item["id"] == "css-order-build-warnings")
        self.assertIn(css["status"], ("mitigated", "open"))
        self.assertFalse(css["blocking"])

    def test_every_item_exposes_an_owner_action(self):
        res = self.client.get(ISSUES_URL)
        for item in res.data["items"]:
            self.assertTrue(item["owner_action"], item["id"])
            self.assertTrue(item["checks"], item["id"])

