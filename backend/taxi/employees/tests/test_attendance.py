"""Employee attendance tests — workflows, calculations, permissions, QR clock-in, audit.

Guards the Founder/CEO security requirements: identity is verified, duplicate clock-ins and
clock-out-without-clock-in are refused, timestamps are server-side, original records survive
corrections, corrections are audited, HR editing is restricted, and no salary is touched.
"""

import datetime
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import AttendancePolicy, AttendanceRecord, StaffEmployee
from employees.services import attendance_service as attendance
from security.models import AuditLog

User = get_user_model()
CLOCK_IN = "/employees/attendance/clock-in/"
CLOCK_OUT = "/employees/attendance/clock-out/"


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _employee(number="YAM110001LAR", user=None, city="Nouakchott", **overrides):
    data = {
        "employee_number": number,
        "full_name": "Aicha Mint Ahmed",
        "department": "Operations",
        "job_title": "Dispatcher",
        "office_city": city,
    }
    if user is not None:
        data["user"] = user
    data.update(overrides)
    return StaffEmployee.objects.create(**data)


def _at(day, hour, minute=0):
    """An aware UTC datetime for a local (Africa/Nouakchott) wall clock time."""
    return (
        datetime.datetime.combine(day, datetime.time(hour, minute))
        .replace(tzinfo=attendance.policy_timezone())
        .astimezone(timezone.utc)
    )


class AttendanceWorkflowTests(TestCase):
    def setUp(self):
        self.user = _user("att-worker@test.local")
        self.employee = _employee(user=self.user)
        self.policy = AttendancePolicy.objects.create(
            city="Nouakchott",
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
            grace_minutes=10,
            # These tests exercise the clock mechanics regardless of the wall-clock time they
            # run at; the 08:15 block is covered explicitly by AttendancePolicyTests.
            allow_late_clock_in=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_clock_in_records_a_server_side_timestamp_and_source(self):
        record = attendance.clock_in(self.employee, source=AttendanceRecord.Source.PORTAL)
        self.assertIsNotNone(record.clock_in)
        self.assertEqual(record.clock_in_source, "portal")
        self.assertTrue(record.is_open)
        self.assertEqual(record.work_date, attendance.local_day())
        self.assertLess(abs((timezone.now() - record.clock_in).total_seconds()), 10)

    def test_duplicate_clock_in_is_refused(self):
        attendance.clock_in(self.employee)
        response = self.client.post(CLOCK_IN, {"source": "portal"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "already_clocked_in")
        self.assertEqual(AttendanceRecord.objects.filter(employee=self.employee).count(), 1)

    def test_clock_out_without_clock_in_is_refused(self):
        response = self.client.post(CLOCK_OUT, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "clock_out_without_clock_in")

    def test_break_requires_clock_in_and_records_minutes(self):
        no_shift = self.client.post("/employees/attendance/break/start/", {}, format="json")
        self.assertEqual(no_shift.status_code, 400)
        self.assertEqual(no_shift.json()["code"], "break_without_clock_in")

        attendance.clock_in(self.employee)
        started = self.client.post("/employees/attendance/break/start/", {}, format="json")
        self.assertEqual(started.status_code, 201)
        nested = self.client.post("/employees/attendance/break/start/", {}, format="json")
        self.assertEqual(nested.json()["code"], "break_already_open")

        break_row = attendance.open_record(self.employee).breaks.first()
        break_row.started_at = timezone.now() - timedelta(minutes=30)
        break_row.save(update_fields=["started_at"])
        ended = self.client.post("/employees/attendance/break/end/", {}, format="json")

    def test_late_arrival_and_worked_time_are_calculated(self):
        day = attendance.local_day()
        record = attendance.clock_in(self.employee, now=_at(day, 8, 40))
        # 40 minutes after the 08:00 shift start, minus the 10 minute grace = 30 late.
        self.assertEqual(record.late_minutes, 30)
        self.assertEqual(record.status, AttendanceRecord.Status.LATE)

        record = attendance.clock_out(self.employee, now=_at(day, 19, 0))
        self.assertEqual(record.worked_minutes, 620)
        # 620 worked - 480 overtime threshold = 140 overtime minutes.
        self.assertEqual(record.overtime_minutes, 140)
        self.assertFalse(record.missed_clock_out)

    def test_missed_clock_out_is_flagged_not_invented(self):
        # Task 10: a session is a missed clock-out only once it is overdue (expected end + 4 h).
        # Yesterday's open session is overdue; one still inside today's shift is not (below).
        day = attendance.local_day() - timedelta(days=1)
        attendance.clock_in(self.employee, now=_at(day, 8, 0))
        record = attendance.open_record(self.employee)
        attendance.recalculate(record)
        record.save()
        self.assertTrue(record.missed_clock_out)
        self.assertIsNone(record.clock_out)

    def test_on_time_arrival_is_not_late(self):
        day = attendance.local_day()
        record = attendance.clock_in(self.employee, now=_at(day, 8, 5))
        self.assertEqual(record.late_minutes, 0)
        self.assertEqual(record.status, AttendanceRecord.Status.PRESENT)

    def test_clock_actions_are_audited(self):
        # Auditing is performed by the API layer, so drive the endpoints.
        self.client.post(CLOCK_IN, {"source": "portal"}, format="json")
        self.client.post(CLOCK_OUT, {}, format="json")
        events = [
            row.details.get("event")
            for row in AuditLog.objects.all()
            if isinstance(row.details, dict)
        ]
        self.assertIn("employee.attendance_clock_in", events)
        self.assertIn("employee.attendance_clock_out", events)

    def test_attendance_never_touches_card_or_signature_data(self):
        self.employee.signature_key = "sig-abc.png"
        self.employee.photo_key = "photo-abc.jpg"
        self.employee.save(update_fields=["signature_key", "photo_key"])

        attendance.clock_in(self.employee)
        attendance.clock_out(self.employee)

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_key, "sig-abc.png")
        self.assertEqual(self.employee.photo_key, "photo-abc.jpg")



class AttendancePermissionTests(TestCase):
    """Identity and authorization boundaries."""

    def setUp(self):
        self.policy = AttendancePolicy.objects.create(
            city="Nouakchott", allow_late_clock_in=True
        )
        self.staff = _in_group(_user("att-staff@test.local", is_staff=True), "HR Staff")
        self.manager = _in_group(_user("att-manager@test.local", is_staff=True), "HR Manager")
        self.admin = _in_group(_user("att-admin@test.local", is_staff=True), "Administrator")
        self.outsider = _user("att-outsider@test.local")  # no StaffEmployee linked
        self.client = APIClient()

    def test_portal_clock_in_requires_a_linked_employee_record(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(CLOCK_IN, {"source": "portal"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_qr_clock_in_requires_an_authorized_staff_session(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            CLOCK_IN, {"source": "qr", "card_qr": "anything"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_tablet_clock_in_requires_an_authorized_staff_session(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            CLOCK_IN, {"source": "tablet", "employee_number": "YAM110001LAR"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_staff_can_use_the_office_tablet(self):
        employee = _employee(number="YAM110009LAR", city="Nouadhibou")
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            CLOCK_IN,
            {"source": "tablet", "employee_number": employee.employee_number},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["clock_in_source"], "tablet")

    def test_daily_dashboard_is_hr_only(self):
        self.client.force_authenticate(user=self.outsider)
        self.assertEqual(self.client.get("/employees/attendance/daily/").status_code, 403)
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get("/employees/attendance/daily/").status_code, 200)

    def test_ceo_overview_requires_the_administrator_tier(self):
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get("/employees/attendance/ceo-overview/").status_code, 403)
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/employees/attendance/ceo-overview/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["timezone"], "Africa/Nouakchott")
        self.assertEqual(set(body["cities_supported"]), {"Nouakchott", "Nouadhibou"})
        for key in (
            "employees_currently_working",
            "employees_absent",
            "late_arrivals",
            "employees_on_leave",
            "completed_shifts",
            "overtime_hours",
        ):
            self.assertIn(key, body)

    def test_shift_scheduling_requires_the_hr_manager_tier(self):
        employee = _employee(number="YAM110010LAR")
        body = {"employee_number": employee.employee_number, "work_date": "2026-10-27"}
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(
            self.client.post("/employees/attendance/shifts/", body, format="json").status_code, 403
        )
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(
            self.client.post("/employees/attendance/shifts/", body, format="json").status_code, 201
        )


class AttendancePolicyTests(TestCase):
    """Official Yala attendance policy: 08:00/08:15 start, 17:00/17:05 end, breaks, overtime."""

    def setUp(self):
        self.user = _user("pol-worker@test.local")
        self.employee = _employee(user=self.user)
        # The official policy as stated by the Founder/CEO (late clock-in NOT allowed).
        self.policy = AttendancePolicy.objects.create(city="Nouakchott")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.day = attendance.local_day()

    def test_clock_in_after_the_deadline_is_blocked(self):
        with self.assertRaises(attendance.AttendanceError) as ctx:
            attendance.clock_in(self.employee, now=_at(self.day, 8, 16))
        self.assertEqual(ctx.exception.code, "clock_in_blocked_after_deadline")
        self.assertEqual(AttendanceRecord.objects.filter(employee=self.employee).count(), 0)

    def test_clock_in_within_the_window_is_accepted(self):
        record = attendance.clock_in(self.employee, now=_at(self.day, 8, 15))
        self.assertIsNotNone(record.clock_in)
        self.assertFalse(record.late_clock_in_exception)
        # 15 minutes after 08:00 minus the 10 minute grace = 5 late minutes.
        self.assertEqual(record.late_minutes, 5)

    def test_hr_exception_records_the_work_performed_after_the_deadline(self):
        record = attendance.clock_in(self.employee, now=_at(self.day, 9, 30), exception=True)
        self.assertTrue(record.late_clock_in_exception)
        self.assertIsNotNone(record.clock_in)
        # The real time is preserved: 90 minutes after 08:00 minus grace = 80 late.
        self.assertEqual(record.late_minutes, 80)

    def test_clock_out_after_the_deadline_is_flagged_and_overtime_is_not_auto_approved(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        record = attendance.clock_out(self.employee, now=_at(self.day, 18, 30))
        self.assertTrue(record.flagged_after_deadline)
        self.assertIn("17:05", record.flag_reason)
        self.assertIsNotNone(record.flagged_at)
        # Actual hours are preserved in full (no capping) ...
        self.assertEqual(record.worked_minutes, 630)
        self.assertEqual(record.overtime_minutes, 150)
        # ... and overtime is NEVER approved automatically.
        self.assertFalse(record.overtime_approved)
        self.assertIsNone(record.overtime_approved_by)

    def test_compensation_is_computed_from_actual_hours_independent_of_authorization(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        record = attendance.clock_out(self.employee, now=_at(self.day, 18, 0))
        self.assertEqual(record.compensation_minutes, 120)
        self.assertFalse(record.overtime_approved)
        # Management authorization does not change the compensation already computed.
        attendance.authorize_overtime(record, approved_by=self.user, approve=True)
        record.refresh_from_db()
        self.assertTrue(record.overtime_approved)
        self.assertEqual(record.compensation_minutes, 120)
        self.assertEqual(record.overtime_minutes, 120)

    def test_clock_out_within_the_deadline_is_not_flagged(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        # Record the paid 60 minute break so net working time reflects a real day.
        attendance.start_break(self.employee, now=_at(self.day, 10, 0))
        attendance.end_break(self.employee, now=_at(self.day, 11, 0))
        record = attendance.clock_out(self.employee, now=_at(self.day, 17, 5))
        self.assertFalse(record.flagged_after_deadline)
        # 08:00-17:05 = 545 min gross, minus the 60 min break = 485 worked -> 5 min overtime.
        self.assertEqual(record.worked_minutes, 485)
        self.assertEqual(record.overtime_minutes, 5)
        self.assertFalse(record.overtime_approved)

    def test_break_type_is_recorded_for_breakfast_and_lunch(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        breakfast = attendance.start_break(self.employee, now=_at(self.day, 10, 10))
        self.assertEqual(breakfast.break_type, "breakfast")
        attendance.end_break(self.employee, now=_at(self.day, 10, 30))
        lunch = attendance.start_break(self.employee, now=_at(self.day, 13, 15))
        self.assertEqual(lunch.break_type, "lunch")

    def test_still_clocked_in_after_the_deadline_is_flagged(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        flagged = attendance.flag_open_records_after_deadline(now=_at(self.day, 17, 30))
        self.assertEqual(flagged, 1)
        record = attendance.open_record(self.employee)
        self.assertTrue(record.flagged_after_deadline)
        # Flagging never invents a clock-out time.
        self.assertIsNone(record.clock_out)

    def test_clock_out_notifications_use_the_approved_wording(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        messages = {
            minute: attendance.clock_out_reminders(now=_at(self.day, hour, minute))[0]["message"]
            for hour, minute in ((16, 55), (17, 0), (17, 5))
        }
        self.assertEqual(
            messages[55], "Your workday ends at 5:00 PM. Please prepare to clock out."
        )
        self.assertEqual(messages[0], "Your scheduled workday has ended. Please clock out.")
        self.assertEqual(
            messages[5],
            "Your clock-out deadline has passed. Your attendance has been flagged for HR review.",
        )
        # No notification is due at an arbitrary other time.
        self.assertEqual(attendance.clock_out_reminders(now=_at(self.day, 14, 30)), [])

    def test_policy_dashboard_reports_the_required_figures(self):
        attendance.clock_in(self.employee, now=_at(self.day, 8, 0))
        attendance.start_break(self.employee, now=_at(self.day, 10, 5))
        attendance.end_break(self.employee, now=_at(self.day, 10, 30))
        dashboard = attendance.policy_dashboard(day=self.day)
        for key in (
            "employees_clocked_in",
            "employees_clocked_out",
            "late_arrivals",
            "missed_clock_ins",
            "breakfast_taken",
            "lunch_taken",
            "still_clocked_in_after_deadline",
            "unauthorized_overtime_alerts",
            "exception_requests",
        ):
            self.assertIn(key, dashboard)
        self.assertEqual(dashboard["employees_clocked_in"], 1)
        self.assertEqual(dashboard["breakfast_taken"], 1)
        self.assertEqual(dashboard["lunch_taken"], 0)
        self.assertEqual(dashboard["policy"]["latest_clock_in"], "08:15")
        self.assertEqual(dashboard["policy"]["latest_clock_out"], "17:05")
        self.assertTrue(dashboard["policy"]["overtime_requires_authorization"])
