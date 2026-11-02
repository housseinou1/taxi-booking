"""Purge ID-card verification scan records past the retention window.

IP address and user agent are personal data, so scan records are retained only for
a bounded window (``CARD_VERIFICATION_RETENTION_DAYS``, default 90 days — the
window suggested by the approved design in
`.agents/tasks/public-qr-verification-design.md`).

Usage::

    python manage.py purge_card_verification_records --dry-run
    python manage.py purge_card_verification_records
"""

from django.core.management.base import BaseCommand

from employees.services.card_verification import purge_expired_records, retention_days


class Command(BaseCommand):
    help = "Delete ID-card verification scan records older than the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="Override the retention window (default: CARD_VERIFICATION_RETENTION_DAYS).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many records would be deleted without deleting them.",
        )

    def handle(self, *args, **options):
        days = options.get("days") or retention_days()
        dry_run = bool(options.get("dry_run"))
        count = purge_expired_records(days=days, dry_run=dry_run)

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] {count} verification record(s) older than {days} day(s) "
                    "would be deleted."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {count} verification record(s) older than {days} day(s)."
            )
        )
