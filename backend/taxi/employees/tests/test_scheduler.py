"""Phase 4 scheduler tests — the Celery tasks and the local scheduler command.

These assert the scheduler contract: it issues what is due, it is idempotent (a repeated or
overlapping run cannot duplicate a code or a notification), and it never exposes a plaintext
verification code.
"""

from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from employees.models import (
    AttendanceRecord,
    BreakNotification,
    StaffEmployee,
    VerificationChallenge,
)
from employees.services import break_notification_service
from employees.services import verification_service as verification
from employees.tasks import (
    dispatch_break_notifications_task,
    employee_scheduler_tick,
    issue_hourly_verification_task,
)


class SchedulerTestBase(TestCase):
    def setUp(self):
        self.employee = StaffEmployee.objects.create(
            employee_number="YAM110030LAR",
            full_name="Scheduler Test",
            department="Operations",
            job_title="Agent",
        )

    def clocked_in(self, minutes_ago=90):
        return AttendanceRecord.objects.create(
            employee=self.employee,
            work_date=timezone.localdate(),
            city="Nouakchott",
            clock_in=timezone.now() - timedelta(minutes=minutes_ago),
            clock_out=None,
            clock_in_source="portal",
            status=AttendanceRecord.Status.PRESENT,
        )


class VerificationSchedulerTests(SchedulerTestBase):
    def test_task_issues_a_challenge_for_a_due_employee(self):
        self.clocked_in(90)
        result = issue_hourly_verification_task()
        self.assertEqual(result["issued"], 1)
        self.assertEqual(VerificationChallenge.objects.filter(employee=self.employee).count(), 1)

    def test_task_is_idempotent_and_does_not_duplicate_a_code(self):
        self.clocked_in(90)
        issue_hourly_verification_task()
        second = issue_hourly_verification_task()
        self.assertEqual(second["issued"], 0)
        self.assertEqual(VerificationChallenge.objects.filter(employee=self.employee).count(), 1)

    def test_no_challenge_is_issued_for_an_employee_who_is_not_clocked_in(self):
        result = issue_hourly_verification_task()
        self.assertEqual(result["issued"], 0)
        self.assertEqual(VerificationChallenge.objects.count(), 0)

    def test_challenge_stores_a_hash_and_never_a_plaintext_code(self):
        self.clocked_in(90)
        issue_hourly_verification_task()
        challenge = VerificationChallenge.objects.get(employee=self.employee)
        self.assertTrue(challenge.code_hash)
        # A six-digit code is 6 characters; the stored value must be a longer hash, never the code.
        self.assertGreater(len(challenge.code_hash), 6)
        self.assertNotRegex(challenge.code_hash, r"^\d{6}$")

    def test_challenge_expires_five_minutes_after_issue(self):
        self.clocked_in(90)
        issue_hourly_verification_task()
        challenge = VerificationChallenge.objects.get(employee=self.employee)
        window = (challenge.expires_at - challenge.generated_at).total_seconds()
        self.assertAlmostEqual(window, 300, delta=5)


class BreakNotificationSchedulerTests(SchedulerTestBase):
    def test_task_runs_and_is_idempotent(self):
        first = dispatch_break_notifications_task()
        second = dispatch_break_notifications_task()
        self.assertIn("created", first)
        self.assertEqual(second["created"], 0)

    def test_no_notifications_for_an_employee_who_is_not_clocked_in(self):
        result = dispatch_break_notifications_task()
        self.assertEqual(result["created"], 0)
        self.assertEqual(BreakNotification.objects.count(), 0)

    def test_dispatch_never_creates_a_break_record(self):
        """A notification must never manufacture attendance data."""
        from employees.models import AttendanceBreak

        before = AttendanceBreak.objects.count()
        dispatch_break_notifications_task()
        self.assertEqual(AttendanceBreak.objects.count(), before)


class SchedulerTickTests(SchedulerTestBase):
    def test_tick_runs_both_sweeps_and_is_idempotent(self):
        self.clocked_in(90)
        first = employee_scheduler_tick()
        self.assertEqual(first["verification"]["issued"], 1)
        second = employee_scheduler_tick()
        self.assertEqual(second["verification"]["issued"], 0)
        self.assertEqual(second["break_notifications"]["created"], 0)


class LocalSchedulerCommandTests(SchedulerTestBase):
    def test_once_runs_a_single_sweep_without_error(self):
        self.clocked_in(90)
        call_command("run_employee_scheduler", "--once")
        self.assertEqual(VerificationChallenge.objects.filter(employee=self.employee).count(), 1)

    def test_ticks_option_runs_a_bounded_number_of_sweeps(self):
        self.clocked_in(90)
        call_command("run_employee_scheduler", "--ticks", "2", "--interval", "1")
        # Two sweeps, still exactly one challenge — idempotent.
        self.assertEqual(VerificationChallenge.objects.filter(employee=self.employee).count(), 1)


class SmsProviderSafetyTests(TestCase):
    """The verification SMS path must never transmit outside local development."""

    def test_known_local_providers_are_no_send(self):
        for provider in ("mock", "console", "locmem", "dummy"):
            with self.subTest(provider=provider):
                self.assertIn(provider, verification.LOCAL_NO_SEND_PROVIDERS)

    def test_unknown_provider_fails_instead_of_sending(self):
        from django.test import override_settings

        with override_settings(YALA_SMS_PROVIDER="http-real-provider"):
            status, reference = verification.send_verification_sms("+22200000000", "123456")
        self.assertEqual(reference, "provider_not_configured")
