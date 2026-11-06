"""Phase 5.9 tests for the read-only audit_admin_accounts management command.

Verifies the command issues only read (SELECT) SQL, emits no sensitive data,
computes active/inactive and overlap counts correctly, and produces valid JSON.
Runs against the isolated pytest-django test DB — never production.
"""

import io
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection

User = get_user_model()


def _run(json_mode=False):
    out = io.StringIO()
    args = ["audit_admin_accounts"]
    if json_mode:
        args.append("--json")
    call_command(*args, stdout=out)
    return out.getvalue()


class AuditCommandFixtureMixin:
    def _seed(self):
        ceo, _ = Group.objects.get_or_create(name="CEO")
        superadmin, _ = Group.objects.get_or_create(name="Super Admin")
        finance, _ = Group.objects.get_or_create(name="Finance")

        # Designated-CEO-ish active account also in Super Admin (overlap).
        u_ceo = User.objects.create_user(email="ceo@x.local", password="pw", is_staff=True)
        u_ceo.groups.add(ceo, superadmin)

        # Second active CEO member (so the group is NOT a singleton).
        u_ceo2 = User.objects.create_user(email="ceo2@x.local", password="pw", is_staff=True)
        u_ceo2.groups.add(ceo)

        # Active superuser NOT in CEO group.
        User.objects.create_superuser(email="root@x.local", password="pw")

        # Active finance staff (executive access, not CEO).
        u_fin = User.objects.create_user(email="fin@x.local", password="pw", is_staff=True)
        u_fin.groups.add(finance)

        # INACTIVE staff account (must be excluded from active counts).
        User.objects.create_user(email="old@x.local", password="pw", is_staff=True, is_active=False)

        # Plain rider (not staff) — must not count as admin.
        User.objects.create_user(email="rider@x.local", password="pw", is_staff=False)

        return {"u_ceo": u_ceo, "u_ceo2": u_ceo2}


class ReadOnlyGuaranteeTests(AuditCommandFixtureMixin, TestCase):
    def test_command_issues_only_select_statements(self):
        self._seed()
        with CaptureQueriesContext(connection) as ctx:
            _run()
        self.assertTrue(ctx.captured_queries, "command executed no queries")
        for q in ctx.captured_queries:
            sql = q["sql"].lstrip().upper()
            # Every statement must be a read. No INSERT/UPDATE/DELETE/DDL.
            self.assertTrue(sql.startswith("SELECT"), f"non-SELECT SQL executed: {q['sql'][:120]}")
            for forbidden in ("INSERT ", "UPDATE ", "DELETE ", "ALTER ", "DROP ", "CREATE "):
                self.assertNotIn(forbidden, sql, f"write/DDL SQL executed: {q['sql'][:120]}")

    def test_command_does_not_change_row_counts(self):
        self._seed()
        before = (User.objects.count(), Group.objects.count())
        _run()
        _run(json_mode=True)
        after = (User.objects.count(), Group.objects.count())
        self.assertEqual(before, after)


class CountCorrectnessTests(AuditCommandFixtureMixin, TestCase):
    def setUp(self):
        self._seed()
        self.data = json.loads(_run(json_mode=True))

    def test_active_vs_inactive_counts(self):
        # 4 active staff (ceo, ceo2, fin, + superuser is_staff? superuser is not
        # is_staff unless set). create_superuser sets is_staff=True.
        # active staff: ceo, ceo2, fin, root(superuser) = 4; inactive staff: old = 1
        self.assertEqual(self.data["active_staff_accounts"], 4)
        self.assertEqual(self.data["inactive_staff_accounts"], 1)

    def test_group_counts(self):
        self.assertEqual(self.data["ceo_group_members_active"], 2)
        self.assertEqual(self.data["ceo_group_members_total"], 2)
        self.assertEqual(self.data["super_admin_members_active"], 1)
        self.assertEqual(self.data["superusers_active"], 1)

    def test_overlap_calculations(self):
        self.assertEqual(self.data["overlap_ceo_and_super_admin_active"], 1)
        self.assertEqual(self.data["overlap_ceo_and_superuser_active"], 0)
        self.assertEqual(self.data["superusers_active_not_in_ceo"], 1)
        self.assertFalse(self.data["ceo_group_is_singleton_active"])

    def test_executive_access_count(self):
        # active staff (4) ∪ active superusers (1, already staff) ∪ exec-group
        # active (ceo, ceo2, superadmin-same-as-ceo, finance) = the 4 staff.
        self.assertEqual(self.data["executive_access_accounts_active"], 4)

    def test_candidate_ids_are_active_ceo_only(self):
        candidates = set(self.data["ceo_candidate_user_ids_active"])
        active_ceo = set(
            User.objects.filter(groups__name="CEO", is_active=True).values_list("pk", flat=True)
        )
        self.assertEqual(candidates, active_ceo)


class OutputSafetyTests(AuditCommandFixtureMixin, TestCase):
    def test_no_sensitive_data_in_text_output(self):
        self._seed()
        text = _run()
        # No emails and no credential VALUES. (The static header line legitimately
        # contains the reassurance word "secrets"; we assert no actual secret
        # material — password hashes, tokens — nor any seeded email appears.)
        self.assertNotIn("@", text)
        self.assertNotIn("pbkdf2", text.lower())
        self.assertNotIn("pw", text.lower().split())  # no raw seeded password token
        for email_local in ("ceo@x.local", "root@x.local", "fin@x.local"):
            self.assertNotIn(email_local, text)

    def test_no_sensitive_data_in_json_output(self):
        self._seed()
        data = json.loads(_run(json_mode=True))
        serialized = json.dumps(data)
        self.assertNotIn("@", serialized)
        for key, value in data.items():
            # Every value is an int, bool, or a list of ints (opaque PKs).
            if isinstance(value, list):
                self.assertTrue(all(isinstance(v, int) for v in value))
            else:
                self.assertIn(type(value), (int, bool))

    def test_json_output_is_valid(self):
        self._seed()
        # Must parse without error and contain the documented keys.
        data = json.loads(_run(json_mode=True))
        for key in (
            "active_staff_accounts",
            "inactive_staff_accounts",
            "ceo_group_members_active",
            "super_admin_members_active",
            "superusers_active",
            "executive_access_accounts_active",
            "overlap_ceo_and_super_admin_active",
            "ceo_candidate_user_ids_active",
        ):
            self.assertIn(key, data)
