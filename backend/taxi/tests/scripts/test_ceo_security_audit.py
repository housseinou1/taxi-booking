"""Phase 6.1 tests for the standalone scripts/ceo_security_audit.py audit.

Isolated pytest-django test DB. Verifies the standalone script issues only read
(SELECT) SQL, changes no rows, computes counts/overlaps/candidates correctly,
emits valid JSON, and leaks no sensitive data. Does NOT import the employees
app — the script is standalone by design.
"""

import importlib.util
import io
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

User = get_user_model()

# Load the standalone script as a module by file path (scripts/ is not a package).
_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "ceo_security_audit.py"
_spec = importlib.util.spec_from_file_location("ceo_security_audit", _SCRIPT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)  # safe: django.setup() is idempotent under tests


class _Fixture:
    def _seed(self):
        ceo, _ = Group.objects.get_or_create(name="CEO")
        superadmin, _ = Group.objects.get_or_create(name="Super Admin")
        finance, _ = Group.objects.get_or_create(name="Finance")

        a = User.objects.create_user(email="ceo@x.local", password="pw", is_staff=True)
        a.groups.add(ceo, superadmin)  # overlap
        b = User.objects.create_user(email="ceo2@x.local", password="pw", is_staff=True)
        b.groups.add(ceo)  # not singleton
        User.objects.create_superuser(email="root@x.local", password="pw")  # superuser not CEO
        f = User.objects.create_user(email="fin@x.local", password="pw", is_staff=True)
        f.groups.add(finance)
        User.objects.create_user(email="old@x.local", password="pw", is_staff=True, is_active=False)
        User.objects.create_user(email="rider@x.local", password="pw", is_staff=False)


class ReadOnlyTests(_Fixture, TestCase):
    def test_only_select_sql(self):
        self._seed()
        with CaptureQueriesContext(connection) as ctx:
            audit.build_report()
        self.assertTrue(ctx.captured_queries)
        for q in ctx.captured_queries:
            sql = q["sql"].lstrip().upper()
            self.assertTrue(sql.startswith("SELECT"), f"non-SELECT: {q['sql'][:120]}")
            for bad in ("INSERT ", "UPDATE ", "DELETE ", "ALTER ", "DROP ", "CREATE "):
                self.assertNotIn(bad, sql, f"write/DDL: {q['sql'][:120]}")

    def test_no_row_changes(self):
        self._seed()
        before = (User.objects.count(), Group.objects.count())
        audit.build_report()
        audit.main(["--json"])
        after = (User.objects.count(), Group.objects.count())
        self.assertEqual(before, after)


class CorrectnessTests(_Fixture, TestCase):
    def setUp(self):
        self._seed()
        self.r = audit.build_report()

    def test_active_inactive(self):
        # active staff: ceo, ceo2, fin, root(superuser is_staff) = 4; inactive: old = 1
        self.assertEqual(self.r["active_staff_accounts"], 4)
        self.assertEqual(self.r["inactive_staff_accounts"], 1)

    def test_groups_and_overlaps(self):
        self.assertEqual(self.r["ceo_group_members_active"], 2)
        self.assertEqual(self.r["super_admin_members_active"], 1)
        self.assertEqual(self.r["superusers_active"], 1)
        self.assertEqual(self.r["overlap_ceo_and_super_admin_active"], 1)
        self.assertEqual(self.r["overlap_ceo_and_superuser_active"], 0)
        self.assertEqual(self.r["superusers_active_not_in_ceo"], 1)
        self.assertFalse(self.r["ceo_group_is_singleton_active"])

    def test_executive_access(self):
        self.assertEqual(self.r["executive_access_accounts_active"], 4)

    def test_candidates_are_active_ceo(self):
        expected = set(
            User.objects.filter(groups__name="CEO", is_active=True).values_list("pk", flat=True)
        )
        self.assertEqual(set(self.r["ceo_candidate_user_ids_active"]), expected)


class OutputTests(_Fixture, TestCase):
    def test_valid_json_and_only_scalar_values(self):
        self._seed()
        import contextlib

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            audit.main(["--json"])
        data = json.loads(buf.getvalue())  # must parse
        for v in data.values():
            if isinstance(v, list):
                self.assertTrue(all(isinstance(x, int) for x in v))
            else:
                self.assertIn(type(v), (int, bool))

    def test_no_sensitive_data_in_output(self):
        self._seed()
        import contextlib

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            audit.main([])  # text mode
        text = buf.getvalue()
        self.assertNotIn("@", text)  # no emails
        self.assertNotIn("pbkdf2", text.lower())  # no password hashes
        for email in ("ceo@x.local", "root@x.local", "fin@x.local"):
            self.assertNotIn(email, text)
