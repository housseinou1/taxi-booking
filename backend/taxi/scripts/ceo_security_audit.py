"""
Standalone READ-ONLY CEO / admin account security audit.

This is a plain script (NOT a Django management command), so it requires NO
app registration — it does not import or depend on the `employees` app, and it
triggers no migrations. It uses only components already present in the deployed
production backend: django.contrib.auth's User and Group models.

It performs ONLY read (SELECT) queries and makes NO database changes. It prints
anonymized counts and opaque candidate User IDs — never names, emails, password
hashes, JWT tokens, MFA secrets, or any other personal data.

Usage (run INSIDE the existing Django container; uses that container's settings
and DATABASE_URL — no credentials are embedded here):

    docker compose exec django python scripts/ceo_security_audit.py
    docker compose exec django python scripts/ceo_security_audit.py --json

In development:

    DJANGO_SETTINGS_MODULE=taxi.settings python scripts/ceo_security_audit.py

SAFETY:
  - SELECT-only ORM calls (filter / values_list / count); no writes anywhere.
  - No production credentials embedded; relies on the ambient environment.
  - Designates no CEO automatically; prints candidate User IDs only.
  - No app import, no migrations, no settings changes.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# scripts/ lives under the Django project root (/app in production).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group  # noqa: E402

User = get_user_model()

# Groups that currently reach executive/admin surfaces. Inlined so the script
# is self-contained and does NOT import operations.executive_permissions.
EXECUTIVE_GROUPS = {
    "CEO",
    "Super Admin",
    "Accountant",
    "Finance",
    "Operations Manager",
    "Supervisor",
}


def build_report() -> dict:
    """Collect anonymized admin-account facts using read-only queries only."""
    active_staff = set(
        User.objects.filter(is_staff=True, is_active=True).values_list("pk", flat=True)
    )
    inactive_staff = set(
        User.objects.filter(is_staff=True, is_active=False).values_list("pk", flat=True)
    )
    ceo_active = set(
        User.objects.filter(groups__name="CEO", is_active=True).values_list("pk", flat=True)
    )
    ceo_total = set(User.objects.filter(groups__name="CEO").values_list("pk", flat=True))
    superadmin_active = set(
        User.objects.filter(groups__name="Super Admin", is_active=True).values_list("pk", flat=True)
    )
    superadmin_total = set(
        User.objects.filter(groups__name="Super Admin").values_list("pk", flat=True)
    )
    superusers_active = set(
        User.objects.filter(is_superuser=True, is_active=True).values_list("pk", flat=True)
    )
    superusers_total = set(User.objects.filter(is_superuser=True).values_list("pk", flat=True))
    exec_group_active = set(
        User.objects.filter(groups__name__in=EXECUTIVE_GROUPS, is_active=True).values_list(
            "pk", flat=True
        )
    )
    executive_access_active = active_staff | superusers_active | exec_group_active

    return {
        "active_staff_accounts": len(active_staff),
        "inactive_staff_accounts": len(inactive_staff),
        "ceo_group_members_active": len(ceo_active),
        "ceo_group_members_total": len(ceo_total),
        "super_admin_members_active": len(superadmin_active),
        "super_admin_members_total": len(superadmin_total),
        "superusers_active": len(superusers_active),
        "superusers_total": len(superusers_total),
        "executive_access_accounts_active": len(executive_access_active),
        "overlap_ceo_and_super_admin_active": len(ceo_active & superadmin_active),
        "overlap_ceo_and_superuser_active": len(ceo_active & superusers_active),
        "superusers_active_not_in_ceo": len(superusers_active - ceo_active),
        "ceo_group_is_singleton_active": len(ceo_active) == 1,
        "ceo_candidate_user_ids_active": sorted(ceo_active),
    }


def render_text(report: dict) -> str:
    lines = [
        "=== Yala Admin - Standalone Read-Only CEO/Account Audit ===",
        "(anonymized counts; no names/emails/secrets; designates no one)",
        "",
        f"Active staff accounts:              {report['active_staff_accounts']}",
        f"Inactive staff accounts:            {report['inactive_staff_accounts']}",
        f"CEO group members (active/total):   {report['ceo_group_members_active']}/{report['ceo_group_members_total']}",
        f"Super Admin (active/total):         {report['super_admin_members_active']}/{report['super_admin_members_total']}",
        f"Superusers (active/total):          {report['superusers_active']}/{report['superusers_total']}",
        f"Executive-access accounts (active): {report['executive_access_accounts_active']}",
        "",
        "Overlaps (active):",
        f"  CEO and Super Admin: {report['overlap_ceo_and_super_admin_active']}",
        f"  CEO and superuser:   {report['overlap_ceo_and_superuser_active']}",
        f"  superusers not CEO:  {report['superusers_active_not_in_ceo']}",
        f"  CEO group singleton: {report['ceo_group_is_singleton_active']}",
        "",
        "Candidate CEO user IDs (active CEO-group members, opaque PKs only):",
        f"  {report['ceo_candidate_user_ids_active']}",
        "",
        "NOTE: This script designates no one. An authorized decision-maker must",
        "identify the real CEO's user id out-of-band from these candidates.",
    ]
    return "\n".join(lines)


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    report = build_report()
    if "--json" in argv:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render_text(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
