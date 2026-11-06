"""Security regression tests for backend admin authorization.

CONTEXT
-------
The admin shell hides navigation per role, but hiding is not authorization: any
staff member can call an admin endpoint directly with their Bearer token. A prior
audit (``.agents/tasks/role-authorization-matrix.txt``) recorded that
``/auth/users/``, ``/rides/admin/rides/``, ``/payments/admin/withdrawals/``,
``/drivers/list/`` and others answered **HTTP 200 for every staff role**, because
they were guarded by DRF's ``IsAdminUser`` (which only checks ``user.is_staff``).

These tests pin the FIXED behaviour for all six admin roles, using the same role
groups the admin shell resolves.

Three properties are asserted:
  1. an unauthorized role receives HTTP 403 (not 200, not 500);
  2. an authorized role still receives HTTP 200 (no workflow regression);
  3. the bulk user directory never carries national-ID data, for any role.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()

ROLE_ORDER = ("ceo", "ops", "finance", "hr", "support", "platform")

# role key -> Django group name (what the admin shell maps to a role)
ROLE_GROUPS = {
    "ceo": "CEO",
    "ops": "Operations Manager",
    "finance": "Finance",
    "hr": "HR Staff",
    "support": "Support",
    "platform": "Platform Admin",
}

# endpoint -> status per role, in ROLE_ORDER.
# CEO is a member of every module set, so it is allowed everywhere.
ACCESS_MATRIX = {
    # endpoint:                            ceo  ops  fin   hr  sup  plat
    "/auth/users/":                        (200, 200, 403, 403, 200, 403),
    "/rides/history/":                     (200, 200, 403, 403, 200, 403),
    "/rides/admin/rides/":                 (200, 200, 403, 403, 200, 403),
    "/rides/admin/financial-summary/":     (200, 200, 200, 403, 200, 403),
    "/payments/admin/finance/overview/":   (200, 403, 200, 403, 403, 403),
    "/payments/admin/withdrawals/":        (200, 403, 200, 403, 403, 403),
    "/drivers/list/":                      (200, 200, 403, 403, 403, 403),
    "/drivers/performance/":               (200, 200, 403, 403, 403, 403),
    "/safety/admin/incidents/":            (200, 200, 403, 403, 200, 403),
    # Aggregate counters only (no PII) and it feeds the shared home dashboard,
    # so it is deliberately staff-wide rather than module-gated.
    "/admin/approvals/stats/":             (200, 200, 200, 200, 200, 200),
    "/auth/admin/riders/":                 (200, 200, 403, 403, 200, 403),
    "/operations/center/dashboard/":       (200, 200, 403, 403, 403, 403),
    "/operations/fleet/dashboard/":        (200, 200, 403, 403, 403, 403),
    # Phase 3: these two previously resolved to can_view_executive, which is True
    # for every staff member, so all six roles could read live operations, the CEO
    # revenue/refund summary and the finance/support/security panels.
    "/operations/command/":                (200, 200, 200, 403, 403, 403),
    "/operations/executive/dashboard/":    (200, 200, 200, 403, 403, 403),
}

# Endpoints that returned 200 for EVERY staff role before the fix. A regression
# here means the hole is back.
FORMERLY_UNGUARDED = [
    "/auth/users/",
    "/rides/history/",
    "/rides/admin/rides/",
    "/payments/admin/withdrawals/",
    "/drivers/list/",
]

PII_FIELDS = ("national_id_number", "national_id_document")


class AdminAuthorizationSecurityTests(TestCase):
    """Six-role authorization matrix over the remediated admin endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.users = {}
        for key, group_name in ROLE_GROUPS.items():
            group, _ = Group.objects.get_or_create(name=group_name)
            user = User.objects.create_user(
                email=f"{key}.sec@test.local",
                password="SecTest!2026",
                is_staff=True,
            )
            user.groups.add(group)
            self.users[key] = user

    def _get(self, path, role):
        self.client.force_authenticate(user=self.users[role])
        return self.client.get(path)

    # ------------------------------------------------------------------ tests
    def test_access_matrix(self):
        """Every role gets exactly the documented status on every endpoint."""
        for path, expected_row in ACCESS_MATRIX.items():
            for role, expected in zip(ROLE_ORDER, expected_row):
                with self.subTest(endpoint=path, role=role):
                    response = self._get(path, role)
                    self.assertEqual(
                        response.status_code,
                        expected,
                        msg=(
                            f"{role} on {path}: expected {expected}, "
                            f"got {response.status_code}"
                        ),
                    )

    def test_formerly_unguarded_endpoints_now_deny_roles(self):
        """Each previously wide-open endpoint now refuses the roles it should.

        Before the fix these endpoints answered 200 for EVERY staff role. The
        assertion is driven by ACCESS_MATRIX so the two can never disagree.
        """
        for path in FORMERLY_UNGUARDED:
            expected_row = ACCESS_MATRIX[path]
            denied = [
                role
                for role, status in zip(ROLE_ORDER, expected_row)
                if status == 403
            ]
            with self.subTest(endpoint=path):
                self.assertTrue(
                    denied,
                    msg=f"{path} is still readable by every role - the hole is back",
                )
            for role in denied:
                with self.subTest(endpoint=path, role=role):
                    response = self._get(path, role)
                    self.assertEqual(
                        response.status_code,
                        403,
                        msg=f"{role} must be refused on {path} (was 200 before the fix)",
                    )

    def test_user_directory_never_exposes_national_id(self):
        """The bulk directory carries no national-ID fields for ANY role."""
        for role, expected in zip(ROLE_ORDER, ACCESS_MATRIX["/auth/users/"]):
            if expected != 200:
                continue
            with self.subTest(role=role):
                response = self._get("/auth/users/", role)
                self.assertEqual(response.status_code, 200)
                rows = response.json()
                self.assertIsInstance(rows, list)
                for row in rows:
                    for field in PII_FIELDS:
                        self.assertNotIn(
                            field,
                            row,
                            msg=f"/auth/users/ leaked {field!r} to {role}",
                        )
                    # The non-sensitive status flag is deliberately retained.
                    self.assertIn("has_national_id_document", row)

    def test_authorized_roles_still_receive_directory_data(self):
        """Least privilege must not break the legitimate directory workflow."""
        response = self._get("/auth/users/", "ops")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_anonymous_is_never_authorized(self):
        """No token -> never 200."""
        self.client.force_authenticate(user=None)
        for path in FORMERLY_UNGUARDED:
            with self.subTest(endpoint=path):
                response = self.client.get(path)
                self.assertIn(response.status_code, (401, 403))

    def test_non_staff_rider_keeps_own_ride_history(self):
        """Rider/driver access is preserved: the gate only covers the staff feed."""
        rider = User.objects.create_user(
            email="rider.sec@test.local",
            password="SecTest!2026",
            is_staff=False,
        )
        self.client.force_authenticate(user=rider)
        response = self.client.get("/rides/history/")
        self.assertEqual(
            response.status_code,
            200,
            msg="a non-staff rider must still reach their own ride history",
        )


SENSITIVE_ENDPOINTS = [
    "/auth/users/",
    "/rides/history/",
    "/drivers/list/",
    "/drivers/performance/",
    "/payments/admin/withdrawals/",
    "/rides/admin/rides/",
    "/auth/admin/riders/",
    "/safety/admin/incidents/",
]


class UnclassifiedStaffAuthorizationTests(TestCase):
    """Phase 2 - an unclassified staff account must not reach sensitive APIs.

    'Unclassified' = is_staff, active, in NO recognised admin role group. These
    accounts previously received FULL module access through a compatibility
    fallback in admin_modules_for; that fallback is now removed.
    """

    def setUp(self):
        self.client = APIClient()

    def _unclassified(self, email="unclassified@yala.test"):
        return User.objects.create_user(email=email, password="SecTest!2026", is_staff=True)

    def test_ungrouped_active_staff_is_denied_sensitive_apis(self):
        user = self._unclassified()
        # guard the premise of the test
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.groups.exists())

        self.client.force_authenticate(user=user)
        for path in SENSITIVE_ENDPOINTS:
            with self.subTest(endpoint=path):
                response = self.client.get(path)
                self.assertEqual(
                    response.status_code,
                    403,
                    msg=f"unclassified staff must be refused on {path}",
                )

    def test_ungrouped_staff_resolves_to_the_default_module_set(self):
        from operations.admin_module_permissions import admin_modules_for
        from operations.admin_permissions_service import MODULES_BY_ROLE

        user = self._unclassified()
        self.assertEqual(admin_modules_for(user), frozenset(MODULES_BY_ROLE["staff"]))

    def test_superuser_retains_full_access(self):
        """The founder/CEO superuser must never be locked out."""
        superuser = User.objects.create_superuser(
            email="founder@yala.test", password="SecTest!2026"
        )
        self.assertFalse(superuser.groups.exists())  # still ungrouped
        self.client.force_authenticate(user=superuser)
        for path in SENSITIVE_ENDPOINTS:
            with self.subTest(endpoint=path):
                self.assertEqual(
                    self.client.get(path).status_code,
                    200,
                    msg=f"superuser must retain access to {path}",
                )

    def test_assign_admin_roles_command_restores_access_end_to_end(self):
        """The migration path: assign a role -> the account regains scoped access."""
        from django.core.management import call_command

        user = self._unclassified("migrated@yala.test")
        self.client.force_authenticate(user=user)
        denied_before = [self.client.get(p).status_code for p in SENSITIVE_ENDPOINTS]
        self.assertEqual(set(denied_before), {403})

        call_command("assign_admin_roles", "--email", user.email, "--role", "Finance", "--apply")
        user.refresh_from_db()
        self.assertEqual(
            sorted(user.groups.values_list("name", flat=True)), ["Finance"]
        )

        # Finance: finance endpoint allowed, sensitive rider/ride data still denied
        self.assertEqual(self.client.get("/payments/admin/withdrawals/").status_code, 200)
        self.assertEqual(self.client.get("/auth/users/").status_code, 403)
        self.assertEqual(self.client.get("/rides/history/").status_code, 403)

    def test_assign_command_never_modifies_superusers(self):
        from django.core.management import call_command

        superuser = User.objects.create_superuser(
            email="founder2@yala.test", password="SecTest!2026"
        )
        call_command(
            "assign_admin_roles", "--email", superuser.email, "--role", "Support", "--apply"
        )
        superuser.refresh_from_db()
        self.assertFalse(
            superuser.groups.exists(),
            msg="the command must not add role groups to a superuser",
        )



