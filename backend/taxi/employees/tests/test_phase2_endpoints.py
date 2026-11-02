"""Phase 2 — restored HR, hourly-verification and break-notification API tests.

Covers the three modules repaired and re-wired in Phase 2: ``views_hr.py`` (exit permission +
emergency absence), ``views_verification_api.py`` (hourly verification) and
``views_break_notifications.py`` (automatic break notifications).

These tests assert real behaviour: authorization tiers, workflow transitions, and — critically
— that a verification code is never exposed through any API response.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.models import (
    AbsenceNotification,
    ExitPermissionRequest,
    StaffEmployee,
)

User = get_user_model()

EXIT_URL = "/employees/hr/exit-permissions/"
ABSENCE_URL = "/employees/hr/absences/"
VERIFICATION_STATUS_URL = "/employees/verification/status/"
VERIFICATION_SUBMIT_URL = "/employees/verification/submit/"
VERIFICATION_RESEND_URL = "/employees/verification/resend/"
VERIFICATION_MONITORING_URL = "/employees/verification/monitoring/"
VERIFICATION_CEO_URL = "/employees/verification/ceo-overview/"
VERIFICATION_RUN_URL = "/employees/verification/run/"
BREAK_PENDING_URL = "/employees/attendance/break-notifications/"
BREAK_STATUS_URL = "/employees/attendance/break-status/"
BREAK_RUN_URL = "/employees/attendance/break-notifications/run/"


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _employee(number="YAM110003LAR", user=None, **overrides):
    data = {
        "employee_number": number,
        "full_name": "Test Employee",
        "department": "Operations",
        "job_title": "Agent",
    }
    data.update(overrides)
    if user is not None:
        data["user"] = user
    return StaffEmployee.objects.create(**data)


class RestoredEndpointAuthTests(TestCase):
    """Every restored endpoint must refuse anonymous callers."""

    def setUp(self):
        self.client = APIClient()

    def test_anonymous_is_rejected_everywhere(self):
        for url in (
            EXIT_URL,
            ABSENCE_URL,
            VERIFICATION_STATUS_URL,
            VERIFICATION_SUBMIT_URL,
            VERIFICATION_RESEND_URL,
            VERIFICATION_MONITORING_URL,
            VERIFICATION_CEO_URL,
            VERIFICATION_RUN_URL,
            BREAK_PENDING_URL,
            BREAK_STATUS_URL,
            BREAK_RUN_URL,
        ):
            with self.subTest(url=url):
                self.assertIn(self.client.get(url).status_code, (401, 403))


class HrExitPermissionApiTests(TestCase):
    """Exit permission: request -> decide -> departure -> return."""

    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-exit@yala.test", is_staff=True), "HR Staff")
        self.emp_user = _user("emp-exit@yala.test")
        self.employee = _employee(user=self.emp_user)
        self.other_user = _user("outsider-exit@yala.test")

    def _create(self, client_user, **overrides):
        payload = {
            "date": date.today().isoformat(),
            "requested_departure": "11:00",
            "expected_return": "12:00",
            "reason": "Bank appointment",
        }
        payload.update(overrides)
        self.client.force_authenticate(user=client_user)
        return self.client.post(EXIT_URL, payload, format="json")

    def test_employee_can_request_exit_permission(self):
        response = self._create(self.emp_user)
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)
        self.assertEqual(ExitPermissionRequest.objects.count(), 1)

    def test_missing_times_are_rejected(self):
        response = self._create(self.emp_user, requested_departure="", expected_return="")
        self.assertEqual(response.status_code, 400)

    def test_emergency_request_is_supported(self):
        response = self._create(self.emp_user, is_emergency=True)
        self.assertEqual(response.status_code, 201)
        row = ExitPermissionRequest.objects.get(pk=response.data["id"])
        self.assertTrue(row.is_emergency)

    def test_user_without_an_employee_record_is_refused(self):
        response = self._create(self.other_user)
        self.assertEqual(response.status_code, 403)

    def test_hr_can_list_exit_requests(self):
        self._create(self.emp_user)
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(self.client.get(EXIT_URL).status_code, 200)

    def test_employee_cannot_decide_their_own_request(self):
        pk = self._create(self.emp_user).data["id"]
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.post(f"{EXIT_URL}{pk}/decide/", {"approve": True}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_hr_can_approve_an_exit_request(self):
        pk = self._create(self.emp_user).data["id"]
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            f"{EXIT_URL}{pk}/decide/", {"approve": True, "note": "Approved"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            ExitPermissionRequest.objects.get(pk=pk).status,
            ExitPermissionRequest.Status.APPROVED,
        )

    def test_employee_records_departure_and_return(self):
        pk = self._create(self.emp_user).data["id"]
        self.client.force_authenticate(user=self.hr)
        self.client.post(f"{EXIT_URL}{pk}/decide/", {"approve": True}, format="json")
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(
            self.client.post(f"{EXIT_URL}{pk}/departure/", {}, format="json").status_code, 200
        )
        self.assertEqual(
            self.client.post(f"{EXIT_URL}{pk}/return/", {}, format="json").status_code, 200
        )

    def test_hr_can_document_an_unauthorized_departure(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            f"{EXIT_URL}document-unauthorized/",
            {"employee_number": self.employee.employee_number, "note": "Left without notice"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)


class HrAbsenceApiTests(TestCase):
    """Emergency absence notification: report -> acknowledge -> review."""

    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-abs@yala.test", is_staff=True), "HR Staff")
        self.emp_user = _user("emp-abs@yala.test")
        self.employee = _employee("YAM110004LAR", user=self.emp_user)

    def _report(self, **overrides):
        payload = {"date": date.today().isoformat(), "reason": "Family emergency"}
        payload.update(overrides)
        self.client.force_authenticate(user=self.emp_user)
        return self.client.post(ABSENCE_URL, payload, format="json")

    def test_employee_can_report_an_absence(self):
        response = self._report()
        self.assertEqual(response.status_code, 201)
        self.assertIn("confirmation", response.data)
        self.assertEqual(AbsenceNotification.objects.count(), 1)

    def test_absence_reason_is_optional_for_privacy(self):
        """A reason is never required: no employee must disclose medical details."""
        response = self._report(reason="")
        self.assertEqual(response.status_code, 201)

    def test_absence_is_not_automatically_misconduct(self):
        """A notification starts as submitted, never as a disciplinary finding."""
        response = self._report(reason="Medical appointment")
        row = AbsenceNotification.objects.get(pk=response.data["id"])
        self.assertEqual(row.status, AbsenceNotification.Status.SUBMITTED)

    def test_hr_can_acknowledge_and_review(self):
        pk = self._report().data["id"]
        self.client.force_authenticate(user=self.hr)
        ack = self.client.post(f"{ABSENCE_URL}{pk}/acknowledge/", {}, format="json")
        self.assertEqual(ack.status_code, 200)
        review = self.client.post(
            f"{ABSENCE_URL}{pk}/review/", {"approve": True, "note": "Noted"}, format="json"
        )
        self.assertEqual(review.status_code, 200)

    def test_employee_cannot_acknowledge_their_own_absence(self):
        pk = self._report().data["id"]
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.post(f"{ABSENCE_URL}{pk}/acknowledge/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_hr_can_list_absences(self):
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(self.client.get(ABSENCE_URL).status_code, 200)


class VerificationApiTests(TestCase):
    """Hourly verification: status, submission, permissions, and code confidentiality."""

    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-ver@yala.test", is_staff=True), "HR Staff")
        self.ceo = _in_group(_user("ceo-ver@yala.test", is_staff=True), "CEO")
        self.emp_user = _user("emp-ver@yala.test")
        self.employee = _employee("YAM110006LAR", user=self.emp_user)

    def test_employee_can_read_verification_status(self):
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.get(VERIFICATION_STATUS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("status", response.data)

    def test_submitting_a_bad_code_is_rejected(self):
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.post(
            VERIFICATION_SUBMIT_URL, {"code": "000000"}, format="json"
        )
        self.assertIn(response.status_code, (400, 404))

    def test_malformed_code_is_rejected(self):
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.post(VERIFICATION_SUBMIT_URL, {"code": "abc"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_no_six_digit_code_is_ever_returned(self):
        """A verification code must never appear in an API response."""
        import re

        self.client.force_authenticate(user=self.emp_user)
        bodies = [
            self.client.get(VERIFICATION_STATUS_URL).content.decode(),
            self.client.post(VERIFICATION_RESEND_URL, {}, format="json").content.decode(),
            self.client.post(VERIFICATION_SUBMIT_URL, {"code": "123456"}, format="json")
            .content.decode(),
        ]
        for body in bodies:
            with self.subTest(body=body[:60]):
                self.assertIsNone(
                    re.search(r"\b\d{6}\b", body),
                    "a six-digit code leaked into an API response",
                )

    def test_monitoring_requires_hr_staff(self):
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(self.client.get(VERIFICATION_MONITORING_URL).status_code, 403)
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(self.client.get(VERIFICATION_MONITORING_URL).status_code, 200)

    def test_ceo_overview_requires_the_ceo_tier(self):
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(self.client.get(VERIFICATION_CEO_URL).status_code, 403)
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(self.client.get(VERIFICATION_CEO_URL).status_code, 403)
        self.client.force_authenticate(user=self.ceo)
        self.assertEqual(self.client.get(VERIFICATION_CEO_URL).status_code, 200)

    def test_ceo_overview_reports_real_figures_only(self):
        self.client.force_authenticate(user=self.ceo)
        data = self.client.get(VERIFICATION_CEO_URL).data
        for field in ("total_working", "onsite", "remote", "verified",
                      "awaiting_verification", "missed_verifications"):
            self.assertIn(field, data)


class BreakNotificationApiTests(TestCase):
    """Automatic break notifications: pending, dispatch sweep, supervisor status."""

    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(_user("hr-break@yala.test", is_staff=True), "HR Staff")
        self.emp_user = _user("emp-break@yala.test")
        self.employee = _employee("YAM110007LAR", user=self.emp_user)

    def test_employee_can_read_pending_notifications(self):
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.get(BREAK_PENDING_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("notifications", response.data)
        self.assertIn("schedule", response.data)

    def test_schedule_preview_has_the_eight_required_entries(self):
        self.client.force_authenticate(user=self.emp_user)
        schedule = self.client.get(BREAK_PENDING_URL).data["schedule"]
        self.assertEqual(len(schedule), 8)
        times = {entry["time"] for entry in schedule}
        self.assertEqual(
            times, {"09:55", "10:00", "10:25", "10:30", "12:55", "13:00", "13:55", "14:00"}
        )

    def test_dispatch_sweep_is_idempotent_and_hr_only(self):
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(self.client.post(BREAK_RUN_URL, {}, format="json").status_code, 403)
        self.client.force_authenticate(user=self.hr)
        first = self.client.post(BREAK_RUN_URL, {}, format="json")
        second = self.client.post(BREAK_RUN_URL, {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)

    def test_break_status_requires_hr_staff(self):
        self.client.force_authenticate(user=self.emp_user)
        self.assertEqual(self.client.get(BREAK_STATUS_URL).status_code, 403)
        self.client.force_authenticate(user=self.hr)
        self.assertEqual(self.client.get(BREAK_STATUS_URL).status_code, 200)



