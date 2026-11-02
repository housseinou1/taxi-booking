"""Local background scheduler for the employee attendance features (Phase 4).

Runs the same work that Celery Beat schedules in production — hourly verification issuance and
break / clock-out notification dispatch — but as a self-contained foreground loop, so it can be
started in a local environment **without a Redis broker**.

It delegates to exactly the same service-layer functions as the Celery tasks
(``employees/tasks.py``); no business logic is duplicated here.

Usage::

    # Run aligned to the minute, forever (the local "worker"):
    python manage.py run_employee_scheduler

    # Demonstrate N timed executions, then exit (evidence capture):
    python manage.py run_employee_scheduler --ticks 3 --interval 20

    # A single immediate sweep:
    python manage.py run_employee_scheduler --once

All timestamps are reported in the project timezone (Africa/Nouakchott).
"""

import time as _time
from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from employees.services import break_notification_service
from employees.services import verification_service as verification


class Command(BaseCommand):
    help = "Run the local employee attendance scheduler (verification + break notifications)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single sweep immediately and exit.",
        )
        parser.add_argument(
            "--ticks",
            type=int,
            default=0,
            help="Run this many sweeps then exit (0 = run forever).",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=60,
            help="Seconds between sweeps when not aligning to the minute (default 60).",
        )
        parser.add_argument(
            "--align",
            action="store_true",
            help="Sleep until the next minute boundary before each sweep (clock-aligned).",
        )

    def _sweep(self, tick, total):
        """Run one scheduler tick and print timestamped evidence."""
        issued = verification.schedule_due_challenges()
        missed = verification.expire_due_challenges()
        created = break_notification_service.dispatch_break_notifications()
        # Task 10: same steps as the Celery tick (employees.tasks.employee_scheduler_tick).
        # Both are idempotent (unique notification key / flag updates), so no duplicates.
        clock_out_created = break_notification_service.dispatch_clock_out_notifications()
        from employees.services import attendance_service

        swept = attendance_service.attendance_sweep()

        local_now = timezone.localtime()
        stamp = local_now.strftime("%Y-%m-%d %H:%M:%S")
        label = f"tick {tick}/{total}" if total else f"tick {tick}"

        self.stdout.write(
            f"[{stamp} Africa/Nouakchott] {label} :: "
            f"verification issued={issued} missed={missed} | "
            f"break notifications created={created} | "
            f"clock-out notifications created={clock_out_created} | "
            f"deadline flagged={swept['deadline_flagged']} "
            f"missed clock-outs flagged={swept['missed_clock_outs_flagged']}"
        )
        return {"issued": issued, "missed": missed, "created": created,
                "clock_out_created": clock_out_created, **swept}

    def _sleep_to_next_minute(self):
        local_now = timezone.localtime()
        seconds = 60 - local_now.second - (local_now.microsecond / 1_000_000)
        if seconds > 0:
            _time.sleep(seconds)

    def handle(self, *args, **options):
        once = options["once"]
        ticks = options["ticks"]
        interval = max(1, options["interval"])
        align = options["align"]

        self.stdout.write(
            self.style.SUCCESS(
                f"Employee scheduler starting · timezone={timezone.get_current_timezone_name()} "
                f"· sms_provider={verification.sms_provider_name()}"
            )
        )
        self.stdout.write(
            "Work: hourly verification issuance/expiry + break and clock-out notification dispatch."
        )

        if once:
            self._sweep(1, 1)
            self.stdout.write(self.style.SUCCESS("Single sweep complete."))
            return

        tick = 0
        try:
            while True:
                tick += 1
                self._sweep(tick, ticks)
                if ticks and tick >= ticks:
                    break
                if align:
                    self._sleep_to_next_minute()
                else:
                    _time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Scheduler interrupted by operator."))

        self.stdout.write(self.style.SUCCESS(f"Scheduler stopped after {tick} tick(s)."))
