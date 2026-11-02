"""Employee attendance API (staff-gated; no public endpoints).

Clock-in methods supported (Founder/CEO directive):
* **Authenticated employee portal** — the signed-in user's own ``StaffEmployee`` record.
* **Authorized office attendance tablet** — an HR-tier user clocks a named employee in from an
  authorized device (``source="tablet"``); the tablet must hold a staff session, so an
  unattended public surface never exists.
* **Employee ID card QR** — the scanned card value is resolved server-side via the existing
  card-token machinery. The QR carries only an opaque uuid/signed token; no private employee
  data is exposed, and public QR verification stays disabled.

Every clock action is audited. Corrections are a separate approval workflow; the original
attendance record is never silently overwritten.
"""

from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    ATTENDANCE_CITIES,
    AttendanceCorrectionRequest,
    AttendanceRecord,
    ShiftAssignment,
    StaffEmployee,
)
from .permissions import IsEmployeeAdministrator, IsHrManager, IsHrStaff
from .services import attendance_service as attendance
from .services.audit import ENTITY_EMPLOYEE, log_employee_event


def _employee_for(request):
    """The StaffEmployee behind the signed-in user (portal self-service)."""
    return StaffEmployee.objects.filter(user=request.user).first()


def _int_or_zero(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _serialize_record(record):
    return {
        "id": record.id,
        "employee_number": record.employee.employee_number,
        "employee_name": record.employee.full_name,
        "city": record.city,
        "work_date": record.work_date.isoformat(),
        "clock_in": record.clock_in,
        "clock_out": record.clock_out,
        "clock_in_source": record.clock_in_source,
        "clock_out_source": record.clock_out_source,
        "status": record.status,
        "late_minutes": record.late_minutes,
        "break_minutes": record.break_minutes,
        "worked_minutes": record.worked_minutes,
        "overtime_minutes": record.overtime_minutes,
        "missed_clock_out": record.missed_clock_out,
        "break_over_allowance": record.break_over_allowance,
        "is_open": record.is_open,
        "corrected": bool(record.corrected_at),
        "corrected_at": record.corrected_at,
    }


class AttendanceBaseView(APIView):
    permission_classes = [IsAuthenticated]

    #: Rule violations that are authorization failures rather than bad input (Task 10).
    FORBIDDEN_CODES = {"employee_not_active", "self_review_forbidden"}
    #: New conflict with the current attendance state. Existing codes keep their 400 status.
    CONFLICT_CODES = {"previous_session_open"}

    def _fail(self, exc):
        http = status.HTTP_400_BAD_REQUEST
        if exc.code in self.FORBIDDEN_CODES:
            http = status.HTTP_403_FORBIDDEN
        elif exc.code in self.CONFLICT_CODES:
            http = status.HTTP_409_CONFLICT
        return Response({"detail": exc.message, "code": exc.code}, status=http)

    def _require_employee(self, request):
        employee = _employee_for(request)
        if employee is None:
            return None, Response(
                {"detail": "No employee record is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return employee, None


class ClockInView(AttendanceBaseView):
    """POST — clock in (portal, tablet for a named employee, or ID-card QR scan)."""

    def post(self, request):
        source = str(request.data.get("source") or AttendanceRecord.Source.PORTAL).lower()
        if source not in dict(AttendanceRecord.Source.choices):
            source = AttendanceRecord.Source.PORTAL

        if source == AttendanceRecord.Source.QR:
            # QR clock-in is an authorized-tablet action: the scanner must hold a staff session.
            if not IsHrStaff().has_permission(request, self):
                return Response(
                    {"detail": "Scanning an ID card requires an authorized staff session."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            employee = attendance.resolve_card_qr(request.data.get("card_qr"))
            if employee is None:
                log_employee_event(
                    request,
                    event="employee.attendance_qr_scan",
                    summary="Rejected ID-card QR attendance scan",
                    entity_type=ENTITY_EMPLOYEE,
                    details={"accepted": False},
                )
                return Response(
                    {
                        "detail": "That card QR could not be verified for attendance.",
                        "code": "invalid_card_qr",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            log_employee_event(
                request,
                event="employee.attendance_qr_scan",
                summary=f"ID-card QR attendance scan for {employee.employee_number}",
                entity_type=ENTITY_EMPLOYEE,
                entity_id=employee.employee_number,
                details={"accepted": True},
            )
        elif source == AttendanceRecord.Source.TABLET:
            if not IsHrStaff().has_permission(request, self):
                return Response(
                    {"detail": "Tablet clock-in requires an authorized staff session."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            employee = StaffEmployee.objects.filter(
                employee_number=str(request.data.get("employee_number") or "").strip()
            ).first()
            if employee is None:
                return Response(
                    {"detail": "Unknown employee number.", "code": "unknown_employee"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            employee, error = self._require_employee(request)
            if error:
                return error

        try:
            record = attendance.clock_in(
                employee,
                source=source,
                work_mode=request.data.get("work_mode") or None,
                work_location=request.data.get("work_location"),
                # An HR exception (manager-approved) is the ONLY way a blocked late clock-in
                # is recorded; the endpoint requires the HR Manager tier for it.
                exception=bool(request.data.get("exception"))
                and IsHrManager().has_permission(request, self),
            )
        except attendance.AttendanceError as exc:
            return self._fail(exc)

        log_employee_event(
            request,
            event="employee.attendance_clock_in",
            summary=f"Clock-in for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"source": source, "late_minutes": record.late_minutes},
        )
        return Response(_serialize_record(record), status=status.HTTP_201_CREATED)


class ClockOutView(AttendanceBaseView):
    """POST — clock out. Refused when there is no matching clock-in."""

    def post(self, request):
        employee, error = self._require_employee(request)
        if error:
            return error
        try:
            record = attendance.clock_out(employee)
        except attendance.AttendanceError as exc:
            return self._fail(exc)

        log_employee_event(
            request,
            event="employee.attendance_clock_out",
            summary=f"Clock-out for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={
                "worked_minutes": record.worked_minutes,
                "overtime_minutes": record.overtime_minutes,
            },
        )
        return Response(_serialize_record(record))


class BreakStartView(AttendanceBaseView):
    """POST — start a break (requires an open shift)."""

    def post(self, request):
        employee, error = self._require_employee(request)
        if error:
            return error
        try:
            row = attendance.start_break(
                employee, break_type=request.data.get("break_type") or None
            )
        except attendance.AttendanceError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_break_start",
            summary=f"Break started for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"break_type": row.break_type},
        )


        return Response(
            {"id": row.id, "started_at": row.started_at, "break_type": row.break_type},
            status=status.HTTP_201_CREATED,
        )




# ── Self-service history + current status ────────────────────────────────────

class MyAttendanceView(AttendanceBaseView):
    """GET — the signed-in employee's own attendance history (records are always reviewable)."""

    def get(self, request):
        employee, error = self._require_employee(request)
        if error:
            return error
        queryset = AttendanceRecord.objects.filter(employee=employee).select_related("employee")
        start = _parse_date(request.query_params.get("start"))
        end = _parse_date(request.query_params.get("end"))
        if start:
            queryset = queryset.filter(work_date__gte=start)
        if end:
            queryset = queryset.filter(work_date__lte=end)
        records = list(queryset.order_by("-work_date")[:120])
        open_record = attendance.open_record(employee)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Reviewed own attendance for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
        )
        return Response(
            {
                "employee_number": employee.employee_number,
                "city": employee.office_city,
                "records": [_serialize_record(record) for record in records],
                "open_record": _serialize_record(open_record) if open_record else None,
            }
        )


class AttendanceStatusView(AttendanceBaseView):
    """GET — current clock state for the signed-in employee (drives the clock buttons)."""

    def get(self, request):
        employee, error = self._require_employee(request)
        if error:
            return error
        record = attendance.open_record(employee)
        open_break = (
            record.breaks.filter(ended_at__isnull=True).order_by("-started_at").first()
            if record
            else None
        )
        return Response(
            {
                "employee_number": employee.employee_number,
                "city": employee.office_city,
                "clocked_in": bool(record),
                "on_break": bool(open_break),
                "record": _serialize_record(record) if record else None,
            }
        )


# ── HR dashboards and reports ────────────────────────────────────────────────

class DailyDashboardView(AttendanceBaseView):
    """GET — Attendance Management dashboard (HR Staff).

    ``?view=daily|weekly|monthly`` selects the period summary; ``?city=`` filters to one
    office and ``?date=`` selects the reference day. The daily view includes the
    office/remote split, break state, approved leave, holidays and department breakdown.
    """

    permission_classes = [IsHrStaff]

    def get(self, request):
        city = request.query_params.get("city") or None
        day = _parse_date(request.query_params.get("date"))
        view = str(request.query_params.get("view") or "daily").lower()
        payload = attendance.dashboard_summary(day=day, city=city)
        if view in {"weekly", "monthly"}:
            reference = day or attendance.local_day()
            if view == "weekly":
                period = attendance.weekly_report(reference=reference, city=city)
            else:
                period = attendance.monthly_report(
                    year=reference.year, month=reference.month, city=city
                )
            payload = {
                **payload,
                "view": view,
                "period": period,
                "breakdown": attendance.period_breakdown(
                    period["start"], period["end"], city=city, group="department"
                ),
            }
        else:
            payload = {**payload, "view": "daily"}
        return Response(payload)


class WeeklyReportView(AttendanceBaseView):
    """GET — weekly attendance report (HR Staff)."""

    permission_classes = [IsHrStaff]

    def get(self, request):
        city = request.query_params.get("city") or None
        reference = _parse_date(request.query_params.get("date"))
        return Response(attendance.weekly_report(reference=reference, city=city))


class MonthlyReportView(AttendanceBaseView):
    """GET — monthly attendance report (HR Staff)."""

    permission_classes = [IsHrStaff]

    def get(self, request):
        city = request.query_params.get("city") or None
        return Response(
            attendance.monthly_report(
                year=request.query_params.get("year"),
                month=request.query_params.get("month"),
                city=city,
            )
        )


class AttendanceIssuesView(AttendanceBaseView):
    """GET — late arrivals, absences and overtime for a date (HR Staff).

    ``kind`` selects the view: ``late`` (default), ``absences`` or ``overtime``. Late arrival
    and overtime rows come from real records; absences are derived (scheduled employees with no
    attendance record and not on leave) and are never stored as invented records.
    """

    permission_classes = [IsHrStaff]

    def get(self, request):
        kind = str(request.query_params.get("kind") or "late").lower()
        city = request.query_params.get("city") or None
        day = _parse_date(request.query_params.get("date")) or attendance.local_day()
        records = attendance._records_for(day, city)
        expected = attendance._expected_employees(city)

        if kind == "overtime":
            rows = records.filter(overtime_minutes__gt=0).order_by("-overtime_minutes")
            return Response(
                {
                    "date": day,
                    "city": city or "",
                    "kind": "overtime",
                    "rows": [
                        {
                            "employee_number": r.employee.employee_number,
                            "employee_name": r.employee.full_name,
                            "overtime_minutes": r.overtime_minutes,
                            "worked_minutes": r.worked_minutes,
                        }
                        for r in rows
                    ],
                }
            )

        if kind == "absences":
            recorded_ids = set(records.values_list("employee_id", flat=True))
            on_leave_ids = set(
                records.filter(status=AttendanceRecord.Status.ON_LEAVE).values_list(
                    "employee_id", flat=True
                )
            )
            return Response(
                {
                    "date": day,
                    "city": city or "",
                    "kind": "absences",
                    "on_leave": [
                        {"employee_number": e.employee_number, "employee_name": e.full_name}
                        for e in expected.filter(id__in=on_leave_ids)
                    ],
                    "absent": [
                        {"employee_number": e.employee_number, "employee_name": e.full_name}
                        for e in expected.exclude(id__in=recorded_ids)
                    ],
                }
            )

        rows = records.filter(late_minutes__gt=0).order_by("-late_minutes")
        return Response(
            {
                "date": day,
                "city": city or "",
                "kind": "late",
                "rows": [
                    {
                        "employee_number": r.employee.employee_number,
                        "employee_name": r.employee.full_name,
                        "late_minutes": r.late_minutes,
                        "clock_in": r.clock_in,
                        "status": r.status,
                    }
                    for r in rows
                ],
            }
        )


# ── Shift scheduling (HR Manager) ────────────────────────────────────────────

class ShiftListView(AttendanceBaseView):
    """GET/POST — planned shifts. Scheduling requires the HR Manager tier."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsHrManager()]
        return [IsHrStaff()]

    def get(self, request):
        queryset = ShiftAssignment.objects.select_related("employee", "policy")
        start = _parse_date(request.query_params.get("start"))
        end = _parse_date(request.query_params.get("end"))
        city = request.query_params.get("city") or None
        if start:
            queryset = queryset.filter(work_date__gte=start)
        if end:
            queryset = queryset.filter(work_date__lte=end)
        if city:
            queryset = queryset.filter(city=city)
        return Response(
            {
                "shifts": [
                    {
                        "id": s.id,
                        "employee_number": s.employee.employee_number,
                        "employee_name": s.employee.full_name,
                        "work_date": s.work_date.isoformat(),
                        "city": s.city,
                        "start_time": s.start_time.strftime("%H:%M"),
                        "end_time": s.end_time.strftime("%H:%M"),
                        "notes": s.notes,
                    }
                    for s in queryset[:200]
                ]
            }
        )

    def post(self, request):
        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        work_date = _parse_date(request.data.get("work_date"))
        if work_date is None:
            return Response(
                {"detail": "work_date must be an ISO date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        policy = attendance.get_policy(
            request.data.get("city") or employee.office_city or "Nouakchott"
        )
        shift, created = ShiftAssignment.objects.update_or_create(
            employee=employee,
            work_date=work_date,
            defaults={
                "policy": policy,
                "city": request.data.get("city") or employee.office_city or "Nouakchott",
                "start_time": request.data.get("start_time") or policy.shift_start,
                "end_time": request.data.get("end_time") or policy.shift_end,
                "notes": str(request.data.get("notes") or "")[:200],
                "created_by": request.user,
            },
        )
        log_employee_event(
            request,
            event="employee.attendance_shift_scheduled",
            summary=(
                f"Shift {'created' if created else 'updated'} for "
                f"{employee.employee_number} on {work_date}"
            ),
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"work_date": work_date.isoformat()},
        )
        return Response(
            {"id": shift.id, "work_date": shift.work_date.isoformat(), "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )




# ── Correction requests + HR approval workflow ───────────────────────────────

class CorrectionListCreateView(AttendanceBaseView):
    """GET/POST — correction requests. Employees see their own; HR sees all."""

    def get(self, request):
        queryset = AttendanceCorrectionRequest.objects.select_related("employee")
        if not IsHrStaff().has_permission(request, self):
            employee, error = self._require_employee(request)
            if error:
                return error
            queryset = queryset.filter(employee=employee)
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response(
            {
                "corrections": [
                    {
                        "id": c.id,
                        "employee_number": c.employee.employee_number,
                        "employee_name": c.employee.full_name,
                        "work_date": c.work_date.isoformat(),
                        "request_type": c.request_type,
                        "requested_clock_in": c.requested_clock_in,
                        "requested_clock_out": c.requested_clock_out,
                        "reason": c.reason,
                        "status": c.status,
                        "reviewed_at": c.reviewed_at,
                        "review_note": c.review_note,
                        "created_at": c.created_at,
                    }
                    for c in queryset[:200]
                ]
            }
        )

    def post(self, request):
        from django.utils.dateparse import parse_datetime

        employee_number = str(request.data.get("employee_number") or "").strip()
        if employee_number and IsHrStaff().has_permission(request, self):
            employee = StaffEmployee.objects.filter(employee_number=employee_number).first()
        else:
            employee, error = self._require_employee(request)
            if error:
                return error
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )

        work_date = _parse_date(request.data.get("work_date"))
        if work_date is None:
            return Response(
                {"detail": "work_date must be an ISO date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            correction = attendance.request_correction(
                employee,
                work_date=work_date,
                reason=request.data.get("reason"),
                requested_clock_in=parse_datetime(str(request.data.get("requested_clock_in") or "")),
                requested_clock_out=parse_datetime(
                    str(request.data.get("requested_clock_out") or "")
                ),
                requested_by=request.user,
                # Task 10: previously ignored, so exception/overtime requests could not be filed.
                request_type=str(request.data.get("request_type") or "") or None,
                overtime_minutes_requested=_int_or_zero(request.data.get("overtime_minutes_requested")),
            )
        except attendance.AttendanceError as exc:
            return self._fail(exc)

        log_employee_event(
            request,
            event="employee.attendance_correction_requested",
            summary=f"Attendance correction requested for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"work_date": work_date.isoformat(), "correction_id": correction.id},
        )
        return Response(
            {"id": correction.id, "status": correction.status}, status=status.HTTP_201_CREATED
        )


class CorrectionReviewView(AttendanceBaseView):
    """POST — approve or reject a correction (HR Manager). Audited either way."""

    permission_classes = [IsHrManager]

    DECISIONS = ("approve", "reject")

    def post(self, request, pk, decision):
        # Task 10: only the exact decisions are accepted. Anything else (e.g. a typo) used to
        # REJECT the request; it now returns 400 and leaves the request untouched.
        if decision not in self.DECISIONS:
            return Response(
                {"detail": "Decision must be 'approve' or 'reject'.", "code": "invalid_decision",
                 "valid_decisions": list(self.DECISIONS)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        correction = AttendanceCorrectionRequest.objects.filter(pk=pk).first()
        if correction is None:
            return Response({"detail": "Correction not found."}, status=status.HTTP_404_NOT_FOUND)
        note = str(request.data.get("note") or "")
        try:
            if decision == "approve":
                attendance.approve_correction(correction, reviewed_by=request.user, note=note)
                event = "employee.attendance_correction_approved"
                summary = (
                    f"Approved attendance correction for {correction.employee.employee_number}"
                )
            else:
                attendance.reject_correction(correction, reviewed_by=request.user, note=note)
                event = "employee.attendance_correction_rejected"
                summary = (
                    f"Rejected attendance correction for {correction.employee.employee_number}"
                )
        except attendance.AttendanceError as exc:
            if exc.code == "self_review_forbidden":
                log_employee_event(
                    request,
                    event="employee.attendance_correction_self_review_blocked",
                    summary=f"Blocked self-review of attendance correction {correction.id}",
                    entity_type=ENTITY_EMPLOYEE,
                    entity_id=correction.employee.employee_number,
                    details={"correction_id": correction.id, "decision": decision},
                )
            return self._fail(exc)

        log_employee_event(
            request,
            event=event,
            summary=summary,
            entity_type=ENTITY_EMPLOYEE,
            entity_id=correction.employee.employee_number,
            details={
                "correction_id": correction.id,
                "work_date": correction.work_date.isoformat(),
            },
        )
        return Response({"id": correction.id, "status": correction.status})


# ── CEO attendance overview ──────────────────────────────────────────────────

class CeoAttendanceOverviewView(AttendanceBaseView):
    """GET — company-wide attendance for the CEO Command Center.

    Reports the two offices plus remote staff, department attendance, working hours, late
    arrivals, absences, overtime and pending correction requests — all from verified
    attendance records (nothing estimated). Administrator tier, matching the existing
    employee-administration boundary.
    """

    permission_classes = [IsEmployeeAdministrator]

    def get(self, request):
        from .models import AttendanceCorrectionRequest

        day = _parse_date(request.query_params.get("date"))
        overview = attendance.ceo_overview(day=day)
        reference = day or attendance.local_day()
        month = attendance.monthly_report(year=reference.year, month=reference.month)

        overview.update(
            {
                "cities_supported": list(ATTENDANCE_CITIES),
                "timezone": "Africa/Nouakchott",
                "remote": {
                    "working": overview["company"]["remote_working"],
                    "records_today": attendance.AttendanceRecord.objects.filter(
                        work_date=reference,
                    )
                    .exclude(work_mode=attendance.AttendancePolicy.WorkMode.OFFICE)
                    .count(),
                },
                "departments": overview["company"]["departments"],
                "working_hours_this_month": {
                    "worked_minutes": month["totals"]["worked_minutes"],
                    "worked_hours": round(month["totals"]["worked_minutes"] / 60, 2),
                    "overtime_hours": month["totals"]["overtime_hours"],
                },
                "pending_corrections": AttendanceCorrectionRequest.objects.filter(
                    status=AttendanceCorrectionRequest.Status.PENDING
                ).count(),
                "corrections": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "work_date": row.work_date.isoformat(),
                        "reason": row.reason,
                        "status": row.status,
                    }
                    for row in AttendanceCorrectionRequest.objects.select_related("employee")[:20]
                ],
            }
        )
        return Response(overview)
class BreakEndView(AttendanceBaseView):
    """POST — end the running break."""

    def post(self, request):
        employee, error = self._require_employee(request)
        if error:
            return error
        try:
            row = attendance.end_break(employee)
        except attendance.AttendanceError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_break_end",
            summary=f"Break ended for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"minutes": row.minutes},
        )
        return Response({"id": row.id, "ended_at": row.ended_at, "minutes": row.minutes})


# ── Work schedules, leave and holidays (HR Manager) ──────────────────────────

class WorkScheduleView(AttendanceBaseView):
    """GET/POST — assigned work schedules (full-time/part-time/flexible, office/remote/hybrid)."""

    def get_permissions(self):
        return [IsHrManager()] if self.request.method == "POST" else [IsHrStaff()]

    def get(self, request):
        from .models import EmployeeWorkSchedule

        city = request.query_params.get("city") or None
        queryset = EmployeeWorkSchedule.objects.select_related("employee")
        if city:
            queryset = queryset.filter(employee__office_city=city)
        return Response(
            {
                "schedules": [
                    {
                        "employee_number": s.employee.employee_number,
                        "employee_name": s.employee.full_name,
                        "department": s.employee.department,
                        "office": s.employee.office_city,
                        "schedule_type": s.schedule_type,
                        "work_mode": s.work_mode,
                        "arrangement": s.arrangement,
                        "timezone": s.timezone,
                        "effective_from": (
                            s.effective_from.isoformat() if s.effective_from else None
                        ),
                    }
                    for s in queryset[:200]
                ]
            }
        )

    def post(self, request):
        from .models import EmployeeWorkSchedule

        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        policy = attendance.get_policy(employee.office_city or "Nouakchott")
        schedule, created = EmployeeWorkSchedule.objects.update_or_create(
            employee=employee,
            defaults={
                "policy": policy,
                "schedule_type": request.data.get("schedule_type") or policy.schedule_type,
                "work_mode": request.data.get("work_mode") or policy.work_mode,
                "arrangement": str(request.data.get("arrangement") or "")[:200],
                "timezone": request.data.get("timezone") or policy.timezone,
                "effective_from": _parse_date(request.data.get("effective_from")),
                "approved_by": request.user,
                "notes": str(request.data.get("notes") or "")[:300],
            },
        )
        log_employee_event(
            request,
            event="employee.attendance_shift_scheduled",
            summary=(
                f"Work schedule {'created' if created else 'updated'} "
                f"for {employee.employee_number}"
            ),
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"work_mode": schedule.work_mode, "schedule_type": schedule.schedule_type},
        )
        return Response(
            {"employee_number": employee.employee_number, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class LeaveView(AttendanceBaseView):
    """GET/POST — approved leave. Recording/approving leave requires the HR Manager tier."""

    def get_permissions(self):
        return [IsHrManager()] if self.request.method == "POST" else [IsHrStaff()]

    def get(self, request):
        from .models import LeaveRecord

        queryset = LeaveRecord.objects.select_related("employee")
        city = request.query_params.get("city") or None
        if city:
            queryset = queryset.filter(employee__office_city=city)
        return Response(
            {
                "leave": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "leave_type": row.leave_type,
                        "start_date": row.start_date.isoformat(),
                        "end_date": row.end_date.isoformat(),
                        "status": row.status,
                        "reason": row.reason,
                    }
                    for row in queryset[:200]
                ]
            }
        )

    def post(self, request):
        from django.utils import timezone as _tz

        from .models import LeaveRecord

        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        start = _parse_date(request.data.get("start_date"))
        end = _parse_date(request.data.get("end_date")) or start
        if start is None or end is None or end < start:
            return Response(
                {"detail": "Provide a valid start_date and end_date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        approve = str(request.data.get("status") or "approved").lower() == "approved"
        row = LeaveRecord.objects.create(
            employee=employee,
            leave_type=request.data.get("leave_type") or LeaveRecord.LeaveType.ANNUAL,
            start_date=start,
            end_date=end,
            status=LeaveRecord.Status.APPROVED if approve else LeaveRecord.Status.PENDING,
            reason=str(request.data.get("reason") or "")[:300],
            requested_by=request.user,
            approved_by=request.user if approve else None,
            approved_at=_tz.now() if approve else None,
        )
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Leave recorded for {employee.employee_number} ({start}..{end})",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"leave_type": row.leave_type, "status": row.status},
        )
        return Response({"id": row.id, "status": row.status}, status=status.HTTP_201_CREATED)


class HolidayView(AttendanceBaseView):
    """GET/POST — company holidays (a blank city applies to every office)."""

    def get_permissions(self):
        return [IsHrManager()] if self.request.method == "POST" else [IsHrStaff()]

    def get(self, request):
        from .models import Holiday

        queryset = Holiday.objects.filter(is_active=True)
        year = request.query_params.get("year")
        if year and str(year).isdigit():
            queryset = queryset.filter(date__year=int(year))
        return Response(
            {
                "holidays": [
                    {
                        "id": row.id,
                        "date": row.date.isoformat(),
                        "name": row.name,
                        "city": row.city or "All offices",
                    }
                    for row in queryset[:200]
                ]
            }
        )

    def post(self, request):
        from .models import Holiday

        day = _parse_date(request.data.get("date"))
        name = str(request.data.get("name") or "").strip()
        if day is None or not name:
            return Response(
                {"detail": "Provide a date (YYYY-MM-DD) and a name."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row, created = Holiday.objects.get_or_create(
            date=day,
            name=name,
            city=str(request.data.get("city") or ""),
            defaults={"is_active": True},
        )
        return Response(
            {"id": row.id, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AttendanceExportView(AttendanceBaseView):
    """GET — authorised CSV or PDF attendance export (HR Staff).

    ``?format=csv|pdf`` (default csv) · ``?start=&end=`` (defaults to the current month) ·
    ``?city=`` · ``?work_mode=office|remote|hybrid`` · ``?group=department|work_mode|office``
    returns a grouped summary instead of raw rows.
    """

    permission_classes = [IsHrStaff]

    COLUMNS = [
        "work_date",
        "employee_number",
        "employee_name",
        "department",
        "office",
        "work_mode",
        "work_location",
        "clock_in",
        "clock_out",
        "break_minutes",
        "unpaid_break_minutes",
        "worked_minutes",
        "net_working_minutes",
        "overtime_minutes",
        "status",
        "late_minutes",
        "missed_clock_out",
        "corrected",
    ]

    GROUP_COLUMNS = [
        "group",
        "records",
        "present",
        "late",
        "completed",
        "missed_clock_outs",
        "worked_minutes",
        "net_working_minutes",
        "overtime_minutes",
    ]

    def get(self, request):
        today = attendance.local_day()
        start = _parse_date(request.query_params.get("start")) or today.replace(day=1)
        end = _parse_date(request.query_params.get("end")) or today
        city = request.query_params.get("city") or None
        work_mode = request.query_params.get("work_mode") or None
        group = request.query_params.get("group") or None
        export_format = str(request.query_params.get("format") or "csv").lower()

        if group:
            rows = attendance.period_breakdown(start, end, city=city, group=group)
            columns = self.GROUP_COLUMNS
        else:
            rows = attendance.export_rows(start, end, city=city, work_mode=work_mode)
            columns = self.COLUMNS

        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Attendance export ({export_format}) {start}..{end}",
            entity_type=ENTITY_EMPLOYEE,
            details={"rows": len(rows), "format": export_format, "group": group or "records"},
        )

        if export_format == "pdf":
            return self._pdf(rows, columns, start, end, city)
        return self._csv(rows, columns, start, end)

    def _csv(self, rows, columns, start, end):
        import csv
        import io as _io

        buffer = _io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        response = Response(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="yala-attendance-{start}-{end}.csv"'
        )
        response["Cache-Control"] = "private, no-store"
        return response

    def _pdf(self, rows, columns, start, end, city):
        import io as _io

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

        buffer = _io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=10 * mm,
            rightMargin=10 * mm,
            topMargin=10 * mm,
            bottomMargin=10 * mm,
        )
        styles = getSampleStyleSheet()
        title = Paragraph(
            "Yala Technologies - Employee Attendance<br/>"
            f"{start} to {end}" + (f" - {city}" if city else ""),
            styles["Title"],
        )
        body = [[column.replace("_", " ").title() for column in columns]]
        body += [[str(row.get(column, "")) for column in columns] for row in rows]
        table = Table(body)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a3d2a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        doc.build([title, table])
        response = Response(buffer.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="yala-attendance-{start}-{end}.pdf"'
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


# ── Official policy endpoints (Founder/CEO) ──────────────────────────────────

class ClockOutNotificationsView(AttendanceBaseView):
    """GET — the clock-out notification due now (16:55 / 17:00 / 17:05), HR Staff.

    Returns one entry per employee still clocked in, with the exact approved wording. Safe to
    poll: the helper sends nothing and fabricates nothing.
    """

    permission_classes = [IsHrStaff]

    def get(self, request):
        return Response({"notifications": attendance.clock_out_reminders()})


class PolicyDashboardView(AttendanceBaseView):
    """GET — the official-policy CEO dashboard (Administrator tier)."""

    permission_classes = [IsEmployeeAdministrator]

    def get(self, request):
        day = _parse_date(request.query_params.get("date"))
        city = request.query_params.get("city") or None
        return Response(attendance.policy_dashboard(day=day, city=city))


class FlagDeadlineView(AttendanceBaseView):
    """POST — flag employees still clocked in after the 17:05 deadline (HR Staff)."""

    permission_classes = [IsHrStaff]

    def post(self, request):
        count = attendance.flag_open_records_after_deadline()
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Flagged {count} attendance record(s) past the clock-out deadline",
            entity_type=ENTITY_EMPLOYEE,
            details={"flagged": count},
        )
        return Response({"flagged": count})


class OvertimeAuthorizationView(AttendanceBaseView):
    """POST — management authorization of a record's overtime (HR Manager).

    Overtime is NEVER auto-approved. Authorizing it does not change the hours worked or the
    compensation already calculated from the actual time recorded.
    """

    permission_classes = [IsHrManager]

    def post(self, request, pk):
        record = AttendanceRecord.objects.filter(pk=pk).select_related("employee").first()
        if record is None:
            return Response({"detail": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)
        approve = str(request.data.get("approve", "true")).lower() != "false"
        attendance.authorize_overtime(record, approved_by=request.user, approve=approve)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=(
                f"Overtime {'authorized' if approve else 'withdrawn'} for "
                f"{record.employee.employee_number}"
            ),
            entity_type=ENTITY_EMPLOYEE,
            entity_id=record.employee.employee_number,
            details={"overtime_minutes": record.overtime_minutes, "approved": approve},
        )
        return Response(
            {
                "id": record.id,
                "overtime_approved": record.overtime_approved,
                "overtime_minutes": record.overtime_minutes,
                "compensation_minutes": record.compensation_minutes,
            }
        )
