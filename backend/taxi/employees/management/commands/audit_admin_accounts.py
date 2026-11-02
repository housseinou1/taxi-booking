"""READ-ONLY audit of administrative account structure.

Phase 5.7/5.8 preparation for CEO-only Admin security. This command performs
ONLY read (SELECT) queries and makes NO database changes. It prints anonymized
counts and opaque candidate user IDs — never names, emails, passwords, tokens,
MFA secrets, or any other personal data.

Usage (dev or, by an authorized operator, production):
    python manage.py audit_admin_accounts
    python manage.py audit_admin_accounts --json
"""

import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

User = get_user_model()

# Groups that currently reach executive/admin surfaces (mirrors
# operations.executive_permissions.EXECUTIVE_GROUPS). Kept inline so the audit
# is self-contained and import-order independent.
EXECUTIVE_GROUPS = {
    "CEO",
    "Super Admin",
    "Accountant",
    "Finance",
    "Operations Manager",
    "Supervisor",
}


class Command(BaseCommand):
    help = "Read-only anonymized audit of administrative accounts (no DB writes)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            action="store_true",
            help="Emit the report as a single JSON object instead of lines.",
        )

    def handle(self, *args, **options):
        # ---- Read-only queries only (values_list / count / filter) ----
        active_staff_ids = set(
            User.objects.filter(is_staff=True, is_active=True).values_list("pk", flat=True)
        )
        inactive_staff_ids = set(
            User.objects.filter(is_staff=True, is_active=False).values_list("pk", flat=True)
        )

        ceo_all = set(User.objects.filter(groups__name="CEO").values_list("pk", flat=True))
        ceo_active = set(
            User.objects.filter(groups__name="CEO", is_active=True).values_list("pk", flat=True)
        )
        superadmin_all = set(
            User.objects.filter(groups__name="Super Admin").values_list("pk", flat=True)
        )
        superadmin_active = set(
            User.objects.filter(groups__name="Super Admin", is_active=True).values_list(
                "pk", flat=True
            )
        )
        superusers_all = set(
            User.objects.filter(is_superuser=True).values_list("pk", flat=True)
        )
        superusers_active = set(
            User.objects.filter(is_superuser=True, is_active=True).values_list("pk", flat=True)
        )

        # Accounts that currently reach executive/admin APIs under today's rules
        # (any active staff OR active superuser OR active member of an exec group).
        exec_group_active = set(
            User.objects.filter(
                groups__name__in=EXECUTIVE_GROUPS, is_active=True
            ).values_list("pk", flat=True)
        )
        executive_access_active = active_staff_ids | superusers_active | exec_group_active

        report = {
            # Active administrative accounts
            "active_staff_accounts": len(active_staff_ids),
            "inactive_staff_accounts": len(inactive_staff_ids),
            "ceo_group_members_active": len(ceo_active),
            "ceo_group_members_total": len(ceo_all),
            "super_admin_members_active": len(superadmin_active),
            "super_admin_members_total": len(superadmin_all),
            "superusers_active": len(superusers_active),
            "superusers_total": len(superusers_all),
            "executive_access_accounts_active": len(executive_access_active),
            # Overlapping memberships (counts only)
            "overlap_ceo_and_super_admin_active": len(ceo_active & superadmin_active),
            "overlap_ceo_and_superuser_active": len(ceo_active & superusers_active),
            "superusers_active_not_in_ceo": len(superusers_active - ceo_active),
            "ceo_group_is_singleton_active": len(ceo_active) == 1,
            # Opaque candidate IDs ONLY (no PII) to help designate the CEO.
            # Restricted to ACTIVE CEO-group members.
            "ceo_candidate_user_ids_active": sorted(ceo_active),
        }

        if options.get("json"):
            self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
            return

        self.stdout.write("=== Yala Admin - Read-Only Account Audit ===")
        self.stdout.write("(anonymized counts; no names/emails/secrets)")
        self.stdout.write("")
        self.stdout.write(f"Active staff accounts:            {report['active_staff_accounts']}")
        self.stdout.write(f"Inactive staff accounts:          {report['inactive_staff_accounts']}")
        self.stdout.write(
            f"CEO group members (active/total): {report['ceo_group_members_active']}"
            f"/{report['ceo_group_members_total']}"
        )
        self.stdout.write(
            f"Super Admin (active/total):       {report['super_admin_members_active']}"
            f"/{report['super_admin_members_total']}"
        )
        self.stdout.write(
            f"Superusers (active/total):        {report['superusers_active']}"
            f"/{report['superusers_total']}"
        )
        self.stdout.write(
            f"Executive-access accounts (active): {report['executive_access_accounts_active']}"
        )
        self.stdout.write("")
        self.stdout.write("Overlaps (active):")
        self.stdout.write(f"  CEO and Super Admin: {report['overlap_ceo_and_super_admin_active']}")
        self.stdout.write(f"  CEO and superuser:   {report['overlap_ceo_and_superuser_active']}")
        self.stdout.write(f"  superusers not CEO:  {report['superusers_active_not_in_ceo']}")
        self.stdout.write(f"  CEO group singleton: {report['ceo_group_is_singleton_active']}")
        self.stdout.write("")
        self.stdout.write(
            "Candidate CEO user IDs (active CEO-group members, opaque PKs only):"
        )
        self.stdout.write(f"  {report['ceo_candidate_user_ids_active']}")
        self.stdout.write("")
        self.stdout.write(
            "NOTE: This command designates no one. An authorized decision-maker "
            "must identify the real CEO's user id out-of-band from these candidates."
        )
