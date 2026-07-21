"""Apply RC1 soft-launch PlatformSetting (pilot city + capacity caps)."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from operations.models import PlatformSetting

RC1_DEFAULTS = {
    "enabled": True,
    "release": "v1.0.0-rc1",
    "pilot_city": "Nouakchott",
    "max_drivers": 100,
    "max_riders": 1000,
    "max_couriers": 50,
    "registration_open": True,
    "maintenance_mode": False,
}


class Command(BaseCommand):
    help = "Configure Yala v1.0.0-RC1 soft launch limits via PlatformSetting."

    def add_arguments(self, parser):
        parser.add_argument("--disable", action="store_true", help="Disable soft launch flag.")
        parser.add_argument("--dry-run", action="store_true", help="Print config without saving.")

    def handle(self, *args, **options):
        payload = dict(RC1_DEFAULTS)
        payload["configured_at"] = timezone.now().isoformat()
        if options["disable"]:
            payload["enabled"] = False

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING(f"DRY RUN: {payload}"))
            return

        PlatformSetting.set_value("soft_launch", payload)
        self.stdout.write(self.style.SUCCESS(f"soft_launch PlatformSetting saved: {payload}"))
