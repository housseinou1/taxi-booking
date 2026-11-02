"""Phase 10 — roles & permissions management and Founder/CEO protection.

Verifies the CEO-governed RBAC surface: the role registry, the staff-account
governance view, guarded role assignment and staff-access changes (reason
mandatory, audited), that the CEO/Super Admin role can never be granted, and —
critically — that the Founder/CEO account cannot be demoted, deactivated or
deleted by any administrator through ANY existing endpoint.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from operations.ceo_protection import is_protected_account, protection_summary
from security.models import AuditLog

User = get_user_model()

REGISTRY_URL = "/operations/admin/roles/"
ACCOUNTS_URL = "/operations/admin/roles/accounts/"


def _user(email, is_staff=False, is_superuser=False, user_type="rider"):
    return User.objects.create_user(
        email=email,
        password="pw",
        is_staff=is_staff,
        is_superuser=is_superuser,
        user_type=user_type,
    )


def _in_group(user, group_name):
    group, _ = Group.objects.get_or_create(name=group_name)
    user.groups.add(group)
    return user


class RolesRegistryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-rbac@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops-rbac@yala.test", is_staff=True), "Operations Manager")
        self.plain = _user("plain-rbac@yala.test")

    def test_registry_is_ceo_only(self):
        for user in (self.ops, self.plain):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(REGISTRY_URL).status_code, 403)
            self.assertEqual(self.client.get(ACCOUNTS_URL).status_code, 403)

    def test_registry_lists_roles_modules_and_limits(self):
        self.client.force_authenticate(user=self.ceo)
        res = self.client.get(REGISTRY_URL)

        self.assertEqual(res.status_code, 200)
        roles = {row["role"]: row for row in res.data["roles"]}
        self.assertIn("ceo", roles)
        self.assertIn("finance", roles)
        self.assertTrue(roles["ceo"]["protected"])
        self.assertFalse(roles["ceo"]["assignable"])
        self.assertIn("delivery", roles["ops"]["modules"])
        self.assertIn("withdrawal_mru", roles["finance"]["approval_limits"])
        self.assertNotIn("ceo", res.data["assignable_roles"])
        self.assertIn("finance", res.data["assignable_roles"])
        self.assertTrue(res.data["read_only"])

    def test_registry_reports_the_protection_guarantees(self):
        self.client.force_authenticate(user=self.ceo)
        protection = self.client.get(REGISTRY_URL).data["protection"]
        self.assertIn("CEO", protection["protected_groups"])
        self.assertTrue(protection["self_modification_blocked"])
        self.assertGreaterEqual(len(protection["guarantees"]), 3)

    def test_accounts_view_flags_protected_accounts(self):
        self.client.force_authenticate(user=self.ceo)
        res = self.client.get(ACCOUNTS_URL)

        rows = {row["email"]: row for row in res.data["results"]}
        self.assertTrue(rows["ceo-rbac@yala.test"]["protected"])
        self.assertEqual(rows["ceo-rbac@yala.test"]["role"], "ceo")
        self.assertFalse(rows["ops-rbac@yala.test"]["protected"])
        self.assertEqual(res.data["summary"]["protected"], 1)


class RoleAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-a@yala.test", is_staff=True), "CEO")
        self.other_ceo = _in_group(_user("ceo-b@yala.test", is_staff=True), "CEO")
        self.support = _in_group(_user("support-a@yala.test", is_staff=True), "Support")
        self.root = _user("root-a@yala.test", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=self.ceo)

    def test_role_assignment_requires_a_reason(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.support.id}/role/",
            {"role": "finance", "reason": "no"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            list(self.support.groups.values_list("name", flat=True)), ["Support"]
        )

    def test_role_assignment_changes_managed_groups_and_audits(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.support.id}/role/",
            {"role": "finance", "reason": "Moved to the finance team"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["previous_role"], "support")
        self.assertEqual(res.data["role"], "finance")

        groups = sorted(self.support.groups.values_list("name", flat=True))
        self.assertEqual(groups, ["Accountant", "Finance"])

        log = AuditLog.objects.filter(entity_id=f"user:{self.support.id}").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.details.get("operation"), "role_assign")
        self.assertEqual(log.details.get("previous_role"), "support")
        self.assertEqual(log.details.get("new_role"), "finance")
        self.assertEqual(log.details.get("reason"), "Moved to the finance team")

    def test_ceo_role_can_never_be_granted(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.support.id}/role/",
            {"role": "ceo", "reason": "Attempted escalation"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot be granted", res.data["error"])
        self.assertNotIn("CEO", self.support.groups.values_list("name", flat=True))

    def test_protected_accounts_cannot_be_demoted(self):
        for target in (self.other_ceo, self.root):
            res = self.client.post(
                f"{ACCOUNTS_URL}{target.id}/role/",
                {"role": "support", "reason": "Attempted demotion"},
                format="json",
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("protected", res.data["error"].lower())

        self.other_ceo.refresh_from_db()
        self.assertIn("CEO", self.other_ceo.groups.values_list("name", flat=True))

    def test_cannot_change_own_role(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.ceo.id}/role/",
            {"role": "support", "reason": "Attempted self demotion"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("CEO", self.ceo.groups.values_list("name", flat=True))

    def test_invalid_role_is_rejected(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.support.id}/role/",
            {"role": "wizard", "reason": "Invalid role attempt"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("finance", res.data["assignable_roles"])


class StaffAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-s@yala.test", is_staff=True), "CEO")
        self.staff = _in_group(_user("staff-s@yala.test", is_staff=True), "Support")
        self.other_ceo = _in_group(_user("ceo-t@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

    def test_revoke_access_requires_reason_and_audits(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.staff.id}/access/",
            {"enabled": False, "reason": "no"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.is_staff)

        ok = self.client.post(
            f"{ACCOUNTS_URL}{self.staff.id}/access/",
            {"enabled": False, "reason": "Left the company"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.is_staff)
        # The account itself is preserved (never deleted).
        self.assertTrue(User.objects.filter(pk=self.staff.pk).exists())

        log = AuditLog.objects.filter(entity_id=f"user:{self.staff.id}").first()
        self.assertEqual(log.details.get("operation"), "staff_access")
        self.assertEqual(log.details.get("reason"), "Left the company")

    def test_protected_accounts_keep_their_access(self):
        for target in (self.other_ceo, self.ceo):
            res = self.client.post(
                f"{ACCOUNTS_URL}{target.id}/access/",
                {"enabled": False, "reason": "Attempted lockout"},
                format="json",
            )
            self.assertEqual(res.status_code, 403)
            target.refresh_from_db()
            self.assertTrue(target.is_staff)

    def test_repeat_state_is_rejected(self):
        res = self.client.post(
            f"{ACCOUNTS_URL}{self.staff.id}/access/",
            {"enabled": True, "reason": "Already enabled"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)



class FounderCeoProtectionTests(TestCase):
    """The Founder/CEO cannot be modified through ANY existing account endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("founder@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops-prot@yala.test", is_staff=True), "Operations Manager")
        self.root = _user("root-prot@yala.test", is_staff=True, is_superuser=True)

    def test_protection_helper_identifies_ceo_and_superuser(self):
        self.assertTrue(is_protected_account(self.ceo))
        self.assertTrue(is_protected_account(self.root))
        self.assertFalse(is_protected_account(self.ops))
        self.assertIn("protected_groups", protection_summary())

    def test_rider_suspend_and_reactivate_refuse_the_ceo(self):
        self.client.force_authenticate(user=self.ops)
        self.assertEqual(
            self.client.post(
                f"/auth/users/{self.ceo.id}/suspend/",
                {"reason": "Attempted lockout"},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                f"/auth/users/{self.ceo.id}/reactivate/", {"reason": "n/a"}, format="json"
            ).status_code,
            400,
        )
        self.ceo.refresh_from_db()
        self.assertTrue(self.ceo.is_active)
        self.assertTrue(self.ceo.is_staff)

    def test_generic_block_and_delete_refuse_the_ceo(self):
        self.client.force_authenticate(user=self.ops)
        self.assertEqual(
            self.client.post(f"/auth/users/{self.ceo.id}/block/", {}, format="json").status_code,
            400,
        )
        self.assertEqual(
            self.client.delete(f"/auth/users/{self.ceo.id}/delete-rider/").status_code,
            400,
        )
        self.assertTrue(User.objects.filter(pk=self.ceo.pk).exists())
        self.ceo.refresh_from_db()
        self.assertTrue(self.ceo.is_active)

    def test_ceo_control_actions_refuse_the_founder(self):
        self.client.force_authenticate(user=self.ops)
        # Not CEO-tier: refused outright.
        self.assertEqual(
            self.client.post(
                f"/operations/ceo/accounts/{self.ceo.id}/action/",
                {"action": "suspend", "reason": "Attempted lockout"},
                format="json",
            ).status_code,
            403,
        )

        # Even a peer CEO-tier actor cannot touch the founder.
        other_ceo = _in_group(_user("peer-ceo@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=other_ceo)
        self.assertEqual(
            self.client.post(
                f"/operations/ceo/accounts/{self.ceo.id}/action/",
                {"action": "suspend", "reason": "Attempted lockout"},
                format="json",
            ).status_code,
            403,
        )
        self.ceo.refresh_from_db()
        self.assertTrue(self.ceo.is_active)
        self.assertTrue(self.ceo.is_staff)
        self.assertIn("CEO", self.ceo.groups.values_list("name", flat=True))

    def test_founder_access_survives_a_full_governance_attempt(self):
        """End-to-end: an administrator cannot reduce the Founder's authority."""
        self.client.force_authenticate(user=self.ops)

        attempts = [
            ("post", f"/auth/users/{self.ceo.id}/suspend/", {"reason": "x" * 6}),
            ("post", f"/auth/users/{self.ceo.id}/block/", {}),
            ("delete", f"/auth/users/{self.ceo.id}/delete-rider/", None),
            ("post", f"/operations/ceo/accounts/{self.ceo.id}/action/", {"action": "suspend", "reason": "x" * 6}),
            ("post", f"/operations/admin/roles/accounts/{self.ceo.id}/role/", {"role": "support", "reason": "x" * 6}),
            ("post", f"/operations/admin/roles/accounts/{self.ceo.id}/access/", {"enabled": False, "reason": "x" * 6}),
        ]
        for method, url, payload in attempts:
            if payload is None:
                response = getattr(self.client, method)(url)
            else:
                response = getattr(self.client, method)(url, payload, format="json")
            self.assertIn(response.status_code, (400, 403), f"{url} returned {response.status_code}")

        self.ceo.refresh_from_db()
        self.assertTrue(self.ceo.is_active)
        self.assertTrue(self.ceo.is_staff)
        self.assertTrue(self.ceo.is_superuser is False)  # unchanged
        self.assertIn("CEO", self.ceo.groups.values_list("name", flat=True))
        self.assertEqual(self.ceo.groups.count(), 1)

