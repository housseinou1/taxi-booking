"""Assign an explicit admin role group to staff accounts that have none.

WHY
---
`operations.admin_module_permissions.admin_modules_for` used to grant FULL
module access to any staff account that resolved to the ``staff`` role - i.e.
a staff account in no recognised admin role group. That was a deliberate
compatibility shim, not a security boundary, and it is being removed.

Before removing it, every staff account that must keep admin access needs a real
role. This command performs that assignment explicitly and idempotently.

SAFETY
------
* **Dry run by default.** Nothing is written unless ``--apply`` is passed.
* **Superusers are never modified.** They already resolve to the full CEO module
  set through the ``is_superuser`` branch of ``admin_modules_for``, so they need
  no group and cannot be demoted by this command.
* **Idempotent.** A user already in a role group is reported and skipped.
* **Validated.** Role names are checked against the admin role groups resolved
  from ``operations.admin_permissions_service.ROLE_PRIORITY`` (single source of
  truth), so a typo can never create a group that no role maps to.

USAGE
-----
    python manage.py assign_admin_roles --list
    python manage.py assign_admin_roles --email admin@yala.mr --role CEO
    python manage.py assign_admin_roles --email admin@yala.mr --role CEO --apply
    python manage.py assign_admin_roles --all-ungrouped --role "Operations Manager" --apply
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

from operations.admin_permissions_service import (
    MARKETING_GROUP,
    OPS_MARKETING_GROUP,
    ROLE_PRIORITY,
)

User = get_user_model()


def assignable_groups():
    """role group name -> admin role key, derived from the RBAC source of truth."""
    mapping = {}
    for role_key, group_names in ROLE_PRIORITY:
        for name in group_names:
            mapping[name] = role_key
    mapping.setdefault(MARKETING_GROUP, "marketing")
    mapping.setdefault(OPS_MARKETING_GROUP, "marketing")
    return mapping


def role_groups():
    """The set of group names any staff account should legitimately hold."""
    return set(assignable_groups())


class Command(BaseCommand):
    help = "Assign an explicit admin role group to staff accounts that have none."

    def add_arguments(self, parser):
        parser.add_argument("--list", action="store_true", help="list staff accounts and exit")
        parser.add_argument("--email", help="target a single staff account by email")
        parser.add_argument(
            "--all-ungrouped",
            action="store_true",
            help="target every ungrouped ACTIVE staff account",
        )
        parser.add_argument(
            "--role",
            help="role group to assign (e.g. 'CEO', 'Operations Manager', 'Finance')",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="actually write the changes (default is a dry run)",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="also consider inactive staff accounts (default: active only)",
        )

    def _report_ungrouped(self):
        ungrouped = (
            User.objects.filter(is_staff=True, groups__isnull=True)
            .distinct()
            .order_by("id")
        )
        superusers = [u for u in ungrouped if u.is_superuser]
        others = [u for u in ungrouped if not u.is_superuser]
        self.stdout.write(f"ungrouped staff accounts: {len(ungrouped)}")
        self.stdout.write(f"  superusers (NOT modified by this command): {len(superusers)}")
        for u in superusers:
            self.stdout.write(f"    id={u.id} {u.email} (superuser -> full access already)")
        self.stdout.write(f"  non-superusers: {len(others)}")
        for u in others:
            state = "active" if u.is_active else "INACTIVE"
            self.stdout.write(f"    id={u.id} {u.email} [{state}]")
        return others

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        valid = role_groups()

        if options["list"] or not (options["email"] or options["all_ungrouped"]):
            self.stdout.write(self.style.MIGRATE_HEADING("Staff account report"))
            self._report_ungrouped()
            self.stdout.write("")
            self.stdout.write("assignable role groups: " + ", ".join(sorted(valid)))
            if not apply_changes:
                self.stdout.write(self.style.WARNING("DRY RUN - pass --apply to write"))
            return

        role = options["role"]
        if not role:
            raise CommandError("--role is required when assigning (see --list)")
        if role not in valid:
            raise CommandError(
                f"'{role}' is not an admin role group. Valid: {', '.join(sorted(valid))}"
            )

        group, _ = Group.objects.get_or_create(name=role)

        if options["email"]:
            target_user = User.objects.filter(email__iexact=options["email"]).first()
            if target_user is None:
                raise CommandError(f"no user with email {options['email']!r}")
            targets = [target_user]
        else:
            targets = list(
                User.objects.filter(is_staff=True, groups__isnull=True)
                .distinct()
                .order_by("id")
            )
            if not options["include_inactive"]:
                targets = [u for u in targets if u.is_active]

        if not targets:
            self.stdout.write("nothing to do")
            return

        changed = 0
        for user in targets:
            if user.is_superuser:
                self.stdout.write(
                    self.style.WARNING(f"skip {user.email}: superuser (already has full access)")
                )
                continue
            if not user.is_staff:
                self.stdout.write(self.style.WARNING(f"skip {user.email}: not staff"))
                continue
            if user.groups.exists():
                existing = ", ".join(sorted(user.groups.values_list("name", flat=True)))
                self.stdout.write(f"skip {user.email}: already in [{existing}]")
                continue

            if apply_changes:
                user.groups.add(group)
                changed += 1
                self.stdout.write(self.style.SUCCESS(f"ASSIGNED {user.email} -> {role}"))
            else:
                self.stdout.write(f"would assign {user.email} -> {role}")

        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f"\n{changed} account(s) updated"))
        else:
            self.stdout.write(
                self.style.WARNING(f"\nDRY RUN - {len(targets)} target(s); pass --apply to write")
            )


