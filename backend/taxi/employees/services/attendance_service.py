"""Employee attendance & time-tracking service (Founder/CEO directive).

All business rules live here so the API layer stays thin and every rule is testable.

GUARANTEES
==========
* **Server-side timestamps only.** Every clock time is ``timezone.now()`` (UTC); the client
  never supplies a time. Local wall-clock rendering uses ``Africa/Nouakchott`` (the project
  ``TIME_ZONE``), so Nouakchott and Nouadhibou report on the same company calendar.
* **No duplicate clock-in.** The DB unique constraint ``unique_employee_attendance_day``
  enforces one attendance row per employee per day, and ``clock_in`` refuses a second entry.
* **No clock-out without clock-in.** ``clock_out`` requires an open record.
* **Original records are preserved.** Corrections write the new values while keeping
  ``clock_in_original`` / ``clock_out_original`` and stamping who corrected them and when.
* **No automatic salary deduction, no financial operation.** Nothing here touches money.
* **Personal information stays out of the QR.** The card QR carries an opaque uuid or signed
  token only; this service resolves it server-side behind staff authentication and never
  exposes private fields (no DOB, no national ID, no phone, no email).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from ..models import (
    ATTENDANCE_CITIES,
    AttendanceBreak,
    AttendanceCorrectionRequest,
    AttendancePolicy,
    AttendanceRecord,
    ShiftAssignment,
    StaffEmployee,
    EmploymentStatus,
)


class AttendanceError(Exception):
    """A rule violation. ``code`` is a stable machine-readable identifier."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


DEFAULT_CITY = "Nouakchott"


# ── Policy + time helpers ────────────────────────────────────────────────────

def policy_timezone(policy=None):
    """Timezone used for attendance reporting (company local time)."""
    name = getattr(policy, "timezone", None) or "Africa/Nouakchott"
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # pragma: no cover - tz data always present on supported runtimes
        return timezone.get_current_timezone()


def get_policy(city=DEFAULT_CITY, policy_id=None) -> AttendancePolicy:
    """Return the policy for a city (creating the default row on first use)."""
    if policy_id:
        policy = AttendancePolicy.objects.filter(pk=policy_id).first()
        if policy is None:
            raise AttendanceError("policy_not_found", "Attendance policy not found.")
        return policy
    policy = (
        AttendancePolicy.objects.filter(city=city, is_active=True).order_by("id").first()
        or AttendancePolicy.objects.filter(is_active=True).order_by("id").first()
    )
    if policy is None:
        policy = AttendancePolicy.objects.create(city=city or DEFAULT_CITY)
    return policy


def local_now(now=None, policy=None) -> datetime:
    """Current time in the company's local timezone."""
    moment = now or timezone.now()
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment)
    return moment.astimezone(policy_timezone(policy))


def local_day(now=None, policy=None) -> date:
    """The company-local work date for a moment in time."""
    return local_now(now=now, policy=policy).date()


def _local_to_utc(day: date, wall_clock: time, policy=None) -> datetime:
    """Combine a local work date + wall-clock time into an aware UTC datetime."""
    tz = policy_timezone(policy)
    return datetime.combine(day, wall_clock).replace(tzinfo=tz).astimezone(timezone.utc)


def _minutes_between(start, end) -> int:
    if not start or not end or end <= start:
        return 0
    return int((end - start).total_seconds() // 60)


def _shift_bounds(record, policy):
    """Local shift start/end for a record (its scheduled shift, else the policy)."""
    if record.shift is not None:
        return record.shift.start_time, record.shift.end_time
    return policy.shift_start, policy.shift_end


# ── Shift-aware deadlines (Task 10) ──────────────────────────────────────────

#: A record still open this long after its expected shift end is a missed clock-out.
MISSED_CLOCK_OUT_AFTER_MINUTES = 4 * 60
#: Longest attendance session a correction may create (supports overnight shifts).
MAX_SESSION_MINUTES = 24 * 60


def _wall_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def expected_window(work_date, policy, shift=None):
    """(start, end) of the expected session as aware UTC datetimes.

    Uses the assigned shift when there is one, else the policy. A shift whose end is not after
    its start (e.g. 22:00 -> 06:00) ends on the following calendar day.
    """
    start_t, end_t = (shift.start_time, shift.end_time) if shift else (policy.shift_start, policy.shift_end)
    start = _local_to_utc(work_date, start_t, policy)
    end_day = work_date + timedelta(days=1) if end_t <= start_t else work_date
    return start, _local_to_utc(end_day, end_t, policy)


def clock_in_deadline(work_date, policy, shift=None):
    """Latest permitted clock-in. Policy default: ``latest_clock_in`` (08:15). With an assigned
    shift the same allowance after start applies (08:00 -> 08:15 means shift start + 15 min)."""
    if shift is None:
        return _local_to_utc(work_date, policy.latest_clock_in, policy)
    allowance = max(0, _wall_minutes(policy.latest_clock_in) - _wall_minutes(policy.shift_start))
    start, _ = expected_window(work_date, policy, shift)
    return start + timedelta(minutes=allowance)


def clock_out_deadline(record, policy=None):
    """Clock-out deadline. Policy default: ``latest_clock_out`` (17:05) on the work date. With an
    assigned shift: shift end (next day for overnight shifts) + ``clock_out_flag_after_minutes``."""
    policy = policy or record.policy or get_policy(record.city)
    if record.shift is None:
        return _local_to_utc(record.work_date, policy.latest_clock_out, policy)
    _, end = expected_window(record.work_date, policy, record.shift)
    return end + timedelta(minutes=policy.clock_out_flag_after_minutes)


def is_clock_out_overdue(record, policy=None, now=None) -> bool:
    """True when an open record is past its expected end + MISSED_CLOCK_OUT_AFTER_MINUTES."""
    policy = policy or record.policy or get_policy(record.city)
    _, end = expected_window(record.work_date, policy, record.shift)
    return (now or timezone.now()) > end + timedelta(minutes=MISSED_CLOCK_OUT_AFTER_MINUTES)


def _aware(value, policy=None):
    if value is None or not timezone.is_naive(value):
        return value
    return value.replace(tzinfo=policy_timezone(policy))


def validate_session_times(work_date, clock_in_at, clock_out_at, *, policy=None, now=None):
    """Validate a (possibly corrected) attendance session. Raises AttendanceError.

    * clock-in must fall on the work date (company-local);
    * clock-out must be after clock-in, on the work date or the following day (overnight);
    * a session may not exceed 24 hours or lie in the future.
    """
    moment = now or timezone.now()
    clock_in_at, clock_out_at = _aware(clock_in_at, policy), _aware(clock_out_at, policy)
    for value in (clock_in_at, clock_out_at):
        if value is not None and value > moment:
            raise AttendanceError("time_in_future", "Attendance times cannot be in the future.")
    if clock_in_at is not None and local_day(now=clock_in_at, policy=policy) != work_date:
        raise AttendanceError(
            "clock_in_wrong_date", "The clock-in time must fall on the attendance work date."
        )
    if clock_out_at is not None:
        out_day = local_day(now=clock_out_at, policy=policy)
        if out_day not in (work_date, work_date + timedelta(days=1)):
            raise AttendanceError(
                "clock_out_wrong_date",
                "The clock-out time must fall on the work date or the following day (overnight).",
            )
    if clock_in_at is not None and clock_out_at is not None:
        if clock_out_at <= clock_in_at:
            raise AttendanceError("invalid_time_order", "The clock-out time must be after the clock-in time.")
        if (clock_out_at - clock_in_at) > timedelta(minutes=MAX_SESSION_MINUTES):
            raise AttendanceError("session_too_long", "An attendance session cannot exceed 24 hours.")
    return clock_in_at, clock_out_at


# ── Clock in / out ───────────────────────────────────────────────────────────

def _record_for(employee, day):
    return AttendanceRecord.objects.filter(employee=employee, work_date=day).first()


def open_record(employee) -> AttendanceRecord | None:
    """The employee's currently open attendance record, if any."""
    return (
        AttendanceRecord.objects.filter(
            employee=employee, clock_in__isnull=False, clock_out__isnull=True
        )
        .order_by("-work_date")
        .first()
    )


def clock_in(
    employee,
    *,
    source=AttendanceRecord.Source.PORTAL,
    now=None,
    city=None,
    policy=None,
    work_mode=None,
    work_location=None,
    exception=False,
):
    """Clock the employee in (office or remote).

    POLICY (Founder/CEO): official start is 08:00 and the latest permitted clock-in is 08:15.
    A normal clock-in after 08:15 is **blocked** — it must go through an HR exception request.
    ``exception=True`` (used only when an authorized manager approves the exception) records the
    real time with ``late_clock_in_exception`` set, so the work actually performed is preserved.

    Also refuses a duplicate clock-in on the same work day.
    """
    # Only active employees may clock in, whatever the channel (portal, tablet, QR).
    if getattr(employee, "employment_status", EmploymentStatus.ACTIVE) != EmploymentStatus.ACTIVE:
        raise AttendanceError(
            "employee_not_active",
            "This employee is not active and cannot clock in. Contact HR.",
        )

    policy = policy or get_policy(city or getattr(employee, "office_city", None) or DEFAULT_CITY)
    moment = now or timezone.now()
    day = local_day(now=moment, policy=policy)
    schedule = work_schedule_for(employee)
    mode = work_mode or (schedule.work_mode if schedule else policy.work_mode)
    shift = ShiftAssignment.objects.filter(employee=employee, work_date=day).first()

    # The deadline follows the assigned shift (incl. overnight shifts); without a shift it is
    # the policy's latest clock-in (08:15). Compared at minute precision, as before.
    deadline = clock_in_deadline(day, policy, shift)
    if (
        not exception
        and not policy.allow_late_clock_in
        and moment.replace(second=0, microsecond=0) > deadline
    ):
        latest_local = local_now(now=deadline, policy=policy).strftime("%H:%M")
        raise AttendanceError(
            "clock_in_blocked_after_deadline",
            (
                f"Clock-in is closed: the latest permitted clock-in is "
                f"{latest_local}. An HR exception request is "
                f"required to record work performed after that time."
            ),
        )

    # An earlier session that was never closed must be resolved first (HR correction workflow).
    previous = open_record(employee)
    if previous is not None and previous.work_date != day:
        raise AttendanceError(
            "previous_session_open",
            (
                f"Your attendance for {previous.work_date.isoformat()} is still open. Ask HR to "
                f"record the missing clock-out through an attendance correction before clocking in."
            ),
        )

    try:
        with transaction.atomic():
            record = _clock_in_record(
                employee, day, moment, policy, shift, mode, schedule,
                source=source, city=city, work_location=work_location, exception=exception,
            )
    except IntegrityError:
        # A simultaneous clock-in created the day's row first: same answer as a duplicate.
        raise AttendanceError(
            "already_clocked_in",
            "You have already clocked in today. Only one clock-in is allowed per day.",
        )
    return record


def _clock_in_record(employee, day, moment, policy, shift, mode, schedule, *, source, city,
                     work_location, exception):
    """Create or update the day's record inside the caller's transaction."""
    record = _record_for(employee, day)
    if record and record.clock_in:
        raise AttendanceError(
            "already_clocked_in",
            "You have already clocked in today. Only one clock-in is allowed per day.",
        )
    if record is None:
        record = AttendanceRecord(
            employee=employee,
            work_date=day,
            city=city or getattr(employee, "office_city", None) or DEFAULT_CITY,
            policy=policy,
        )
    record.policy = policy
    record.shift = shift
    record.work_mode = mode
    record.work_location = (
        work_location
        if work_location is not None
        else (schedule.arrangement if schedule else "")
    )[:160]
    record.late_clock_in_exception = bool(exception)
    record.clock_in = moment
    record.clock_in_source = source
    record.clock_out = None
    record.clock_out_source = ""
    record.missed_clock_out = False
    record.save()
    recalculate(record)
    record.save()
    return record


def clock_out(employee, *, source=AttendanceRecord.Source.PORTAL, now=None):
    """Clock the employee out. Refuses a clock-out with no matching clock-in."""
    moment = now or timezone.now()
    record = open_record(employee)
    if record is None:
        day = local_day(now=moment)
        existing = _record_for(employee, day)
        if existing is not None and existing.clock_out:
            raise AttendanceError("already_clocked_out", "You have already clocked out today.")
        raise AttendanceError(
            "clock_out_without_clock_in", "You cannot clock out without clocking in first."
        )

    with transaction.atomic():
        # Close any break that is still running, so the record is internally consistent.
        open_break = record.breaks.filter(ended_at__isnull=True).order_by("-started_at").first()
        if open_break is not None:
            _close_break(open_break, moment)
        record.clock_out = moment
        record.clock_out_source = source
        record.missed_clock_out = False
        recalculate(record)

        # POLICY (Founder/CEO): official end 17:00, deadline 17:05. A later clock-out is
        # FLAGGED for HR review; the actual hours worked are preserved in full and overtime is
        # never auto-approved (management authorization is required separately).
        # The deadline follows the assigned shift end (overnight shifts end the next day).
        deadline = clock_out_deadline(record)
        if moment.replace(second=0, microsecond=0) > deadline:
            local_clock_out = local_now(now=moment, policy=record.policy).strftime("%H:%M")
            record.flagged_after_deadline = True
            record.flag_reason = (
                f"Clocked out at {local_clock_out}, after the "
                f"{local_now(now=deadline, policy=record.policy).strftime('%H:%M')} deadline."
            )[:200]
            record.flagged_at = moment
        record.save()
    return record


# ── Breaks ───────────────────────────────────────────────────────────────────

def start_break(employee, *, source=AttendanceRecord.Source.PORTAL, now=None, break_type=None):
    """Start a break. Requires an open shift and refuses a nested break.

    POLICY (Founder/CEO): breakfast is 10:00–10:30 and lunch is 13:00–14:00. Employees must
    record the start and end of both. The type is stored so HR can see breakfast/lunch
    attendance; starting slightly outside the window is recorded as-is (never silently moved).
    """
    moment = now or timezone.now()
    record = open_record(employee)
    if record is None:
        raise AttendanceError("break_without_clock_in", "Start a break only after clocking in.")
    if record.breaks.filter(ended_at__isnull=True).exists():
        raise AttendanceError("break_already_open", "A break is already in progress.")

    if not break_type:
        # Infer the scheduled break from the local time so the common case needs no input.
        local_time = local_now(now=moment, policy=record.policy).time()
        policy = record.policy or get_policy(record.city)
        if policy.breakfast_start <= local_time <= policy.breakfast_end:
            break_type = AttendanceBreak.BreakType.BREAKFAST
        elif policy.lunch_start <= local_time <= policy.lunch_end:
            break_type = AttendanceBreak.BreakType.LUNCH
        else:
            break_type = AttendanceBreak.BreakType.OTHER

    return AttendanceBreak.objects.create(
        record=record, started_at=moment, source=source, break_type=break_type
    )


def end_break(employee, *, now=None):
    """End the running break. Refuses when no break is open."""
    moment = now or timezone.now()
    record = open_record(employee)
    if record is None:
        raise AttendanceError("no_open_shift", "There is no open shift to end a break for.")
    open_break = record.breaks.filter(ended_at__isnull=True).order_by("-started_at").first()
    if open_break is None:
        raise AttendanceError("no_open_break", "There is no break in progress.")
    with transaction.atomic():
        _close_break(open_break, moment)
        recalculate(record)
        record.save()
    return open_break


def _close_break(break_row, moment):
    break_row.ended_at = moment
    break_row.minutes = _minutes_between(break_row.started_at, moment)
    break_row.save(update_fields=["ended_at", "minutes"])


# ── Calculation ──────────────────────────────────────────────────────────────

def recalculate(record, *, policy=None) -> AttendanceRecord:
    """Derive break/late/worked/overtime minutes and the status from the stored timestamps.

    A pure function of the record's own data plus policy, so it is safe to re-run at any time.
    It never touches money and never deducts salary.
    """
    policy = policy or record.policy or get_policy(record.city)
    if record.pk:
        record.break_minutes = sum(b.minutes or 0 for b in record.breaks.all())

    if record.clock_in and record.clock_out:
        gross = _minutes_between(record.clock_in, record.clock_out)
        record.worked_minutes = max(0, gross - record.break_minutes)
        record.overtime_minutes = max(0, record.worked_minutes - policy.overtime_after_minutes)
        record.missed_clock_out = False
        # Compensation follows the ACTUAL hours worked and is computed independently of
        # whether the overtime was authorized — unauthorized overtime is never erased or capped.
        record.compensation_minutes = record.overtime_minutes
    else:
        record.worked_minutes = 0
        record.overtime_minutes = 0
        record.compensation_minutes = 0
        # Clocked in but never clocked out is flagged for HR follow-up, never auto-corrected —
        # but only once the session is overdue. An employee still inside their shift is working,
        # not "missing a clock-out" (Task 10: previously every open record was flagged at once).
        record.missed_clock_out = bool(record.clock_in) and not record.clock_out and is_clock_out_overdue(
            record, policy
        )

    record.break_over_allowance = record.break_minutes > policy.break_allowance_minutes
    # Paid vs unpaid breaks: break time inside the paid allowance is not deducted, anything
    # beyond it is unpaid. Net working hours = gross presence − unpaid break minutes.
    record.unpaid_break_minutes = max(0, record.break_minutes - policy.paid_break_minutes)
    if record.clock_in and record.clock_out:
        gross_minutes = _minutes_between(record.clock_in, record.clock_out)
        record.net_working_minutes = max(0, gross_minutes - record.unpaid_break_minutes)
    else:
        record.net_working_minutes = 0

    if record.clock_in:
        shift_start, _ = _shift_bounds(record, policy)
        expected = _local_to_utc(record.work_date, shift_start, policy)
        record.late_minutes = max(
            0, _minutes_between(expected, record.clock_in) - policy.grace_minutes
        )
        record.status = (
            AttendanceRecord.Status.LATE
            if record.late_minutes
            else AttendanceRecord.Status.PRESENT
        )
        if record.clock_out and record.worked_minutes < (policy.standard_work_minutes // 2):
            record.status = AttendanceRecord.Status.HALF_DAY
    return record


# ── ID-card QR clock-in ──────────────────────────────────────────────────────

def resolve_card_qr(scanned_value):
    """Resolve a scanned ID-card QR value to the employee, or ``None``.

    Reuses the existing card-token machinery (signed token or legacy uuid) but is **not** the
    public verification endpoint: it runs only behind staff authentication, returns the
    employee record for attendance purposes, and never exposes private fields. Public QR
    verification remains disabled (``PUBLIC_QR_VERIFICATION_ENABLED`` untouched).
    """
    from django.conf import settings

    from ..models import EmployeeIDCard
    from . import verification_tokens as tokens

    value = str(scanned_value or "").strip()
    if not value:
        return None

    if tokens.looks_like_token(value):
        try:
            payload = tokens.validate_token(value)
        except tokens.TokenError:
            return None
        card = (
            EmployeeIDCard.objects.select_related("employee")
            .filter(qr_uuid=payload.get("u"))
            .first()
        )
    else:
        # A bare uuid is only honoured while legacy UUIDs are still accepted.
        if getattr(settings, "CARD_QR_TOKENS_REQUIRED", True):
            return None
        card = EmployeeIDCard.objects.select_related("employee").filter(qr_uuid=value).first()

    if card is None or not card.is_valid():
        return None
    return card.employee




# ── Dashboards, reports and CEO overview ─────────────────────────────────────

def _records_for(day, city=None):
    queryset = AttendanceRecord.objects.filter(work_date=day).select_related(
        "employee", "shift", "policy"
    )
    if city:
        queryset = queryset.filter(city=city)
    return queryset


def _expected_employees(city=None):
    queryset = StaffEmployee.objects.filter(employment_status=EmploymentStatus.ACTIVE)
    if city:
        queryset = queryset.filter(office_city=city)
    return queryset


def scheduled_employee_ids(day, city=None) -> set:
    """Active employees expected to work on ``day`` (Task 10).

    Expected = an assigned shift that day, OR (the day is a workday under the employee's city
    policy AND no active holiday applies — company-wide or for the employee's office city).
    Public holidays and scheduled non-working days therefore never produce absences.
    """
    employees = list(_expected_employees(city).values_list("id", "office_city"))
    with_shift = set(
        ShiftAssignment.objects.filter(work_date=day, employee_id__in=[e for e, _ in employees])
        .values_list("employee_id", flat=True)
    )
    policies, holidays, expected = {}, {}, set()
    for employee_id, office_city in employees:
        if employee_id in with_shift:
            expected.add(employee_id)
            continue
        key = office_city or DEFAULT_CITY
        if key not in policies:
            policies[key] = get_policy(key)
            holidays[key] = holiday_for(day, key) is not None
        if policies[key].is_workday(day) and not holidays[key]:
            expected.add(employee_id)
    return expected


def absent_employee_ids(day, city=None) -> set:
    """Scheduled employees with no clock-in and no approved leave on ``day``."""
    expected = scheduled_employee_ids(day, city)
    clocked = set(
        AttendanceRecord.objects.filter(work_date=day, clock_in__isnull=False).values_list(
            "employee_id", flat=True
        )
    )
    on_leave = set(on_approved_leave(day).values_list("employee_id", flat=True))
    return expected - clocked - on_leave


def daily_dashboard(day=None, city=None, policy=None) -> dict:
    """Daily attendance dashboard: who is working, late, absent, on leave, completed, overtime."""
    policy = policy or get_policy(city or DEFAULT_CITY)
    day = day or local_day(policy=policy)
    records = _records_for(day, city)

    working = records.filter(clock_in__isnull=False, clock_out__isnull=True).count()
    clocked_in = records.filter(clock_in__isnull=False).count()
    completed = records.filter(clock_in__isnull=False, clock_out__isnull=False).count()
    late = records.filter(late_minutes__gt=0).count()
    on_leave = records.filter(status=AttendanceRecord.Status.ON_LEAVE).count()
    missed_clock_out = records.filter(missed_clock_out=True).count()
    overtime = records.aggregate(total=Sum("overtime_minutes"))["total"] or 0
    break_minutes = records.aggregate(total=Sum("break_minutes"))["total"] or 0

    # Absence is derived, never assumed. Task 10: only employees actually scheduled that day
    # (workday, no holiday, or an assigned shift) count, minus clock-ins and approved leave.
    expected = len(scheduled_employee_ids(day, city))
    absent = len(absent_employee_ids(day, city))

    return {
        "date": day,
        "city": city or "",
        "expected_employees": expected,
        "working": working,
        "clocked_in": clocked_in,
        "completed_shifts": completed,
        "late_arrivals": late,
        "on_leave": on_leave,
        "absent": absent,
        "missed_clock_outs": missed_clock_out,
        "overtime_minutes": overtime,
        "overtime_hours": round(overtime / 60, 2),
        "break_minutes": break_minutes,
        "is_workday": policy.is_workday(day),
        "policy": {
            "shift_start": policy.shift_start.strftime("%H:%M"),
            "shift_end": policy.shift_end.strftime("%H:%M"),
            "grace_minutes": policy.grace_minutes,
            "timezone": policy.timezone,
        },
    }


def period_report(start, end, city=None) -> dict:
    """Weekly/monthly attendance report over ``[start, end]`` inclusive."""
    records = AttendanceRecord.objects.filter(work_date__gte=start, work_date__lte=end)
    if city:
        records = records.filter(city=city)

    per_day = list(
        records.values("work_date")
        .annotate(
            present=Count("id", filter=Q(clock_in__isnull=False)),
            late=Count("id", filter=Q(late_minutes__gt=0)),
            completed=Count("id", filter=Q(clock_out__isnull=False)),
            on_leave=Count("id", filter=Q(status=AttendanceRecord.Status.ON_LEAVE)),
            missed_clock_outs=Count("id", filter=Q(missed_clock_out=True)),
            overtime_minutes=Sum("overtime_minutes"),
        )
        .order_by("work_date")
    )

    per_employee = list(
        records.values("employee__employee_number", "employee__full_name", "employee__office_city")
        .annotate(
            days_recorded=Count("id"),
            days_present=Count("id", filter=Q(clock_in__isnull=False)),
            late_days=Count("id", filter=Q(late_minutes__gt=0)),
            missed_clock_outs=Count("id", filter=Q(missed_clock_out=True)),
            worked_minutes=Sum("worked_minutes"),
            overtime_minutes=Sum("overtime_minutes"),
        )
        .order_by("employee__employee_number")
    )

    totals = records.aggregate(
        worked=Sum("worked_minutes"),
        overtime=Sum("overtime_minutes"),
        breaks=Sum("break_minutes"),
    )
    return {
        "start": start,
        "end": end,
        "city": city or "",
        "days": per_day,
        "employees": per_employee,
        "totals": {
            "records": records.count(),
            "worked_minutes": totals["worked"] or 0,
            "overtime_minutes": totals["overtime"] or 0,
            "overtime_hours": round((totals["overtime"] or 0) / 60, 2),
            "break_minutes": totals["breaks"] or 0,
        },
    }


def weekly_report(reference=None, city=None) -> dict:
    """Report for the ISO week containing ``reference`` (defaults to today)."""
    day = reference or local_day()
    start = day - timedelta(days=day.weekday())
    return period_report(start, start + timedelta(days=6), city=city)


def monthly_report(year=None, month=None, city=None) -> dict:
    """Report for a calendar month (defaults to the current company month)."""
    today = local_day()
    year = int(year or today.year)
    month = int(month or today.month)
    start = date(year, month, 1)
    nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return period_report(start, nxt - timedelta(days=1), city=city)


def ceo_overview(day=None) -> dict:
    """CEO Command Center attendance statistics for both operating cities."""
    day = day or local_day()
    # dashboard_summary (not daily_dashboard) so the CEO payload carries the office/remote
    # split and the department breakdown the Command Center displays.
    cities = {city: dashboard_summary(day, city) for city in ATTENDANCE_CITIES}
    company = dashboard_summary(day)
    return {
        "date": day,
        "cities": cities,
        "company": company,
        "employees_currently_working": company["working"],
        "employees_absent": company["absent"],
        "late_arrivals": company["late_arrivals"],
        "employees_on_leave": company["on_leave"],
        "completed_shifts": company["completed_shifts"],
        "overtime_hours": company["overtime_hours"],
        "missed_clock_outs": company["missed_clock_outs"],
    }


# ── Correction requests (employee-initiated, HR-approved) ────────────────────

CORRECTION_REQUEST_TYPES = [value for value, _ in AttendanceCorrectionRequest.RequestType.choices]


def _effective_times(record, requested_clock_in, requested_clock_out):
    current_in = record.clock_in if record else None
    current_out = record.clock_out if record else None
    return requested_clock_in or current_in, requested_clock_out or current_out


def request_correction(
    employee,
    *,
    work_date,
    reason,
    requested_clock_in=None,
    requested_clock_out=None,
    requested_by=None,
    request_type=AttendanceCorrectionRequest.RequestType.CORRECTION,
    overtime_minutes_requested=0,
):
    """File an attendance correction request. Never mutates the attendance record.

    Request types (existing approval effects in ``approve_correction``):
    * ``correction`` — a corrected clock-in and/or clock-out is required;
    * ``late_clock_in_exception`` — the actual (late) clock-in time is required;
    * ``overtime_authorization`` — an existing, completed record for the day is required.
    Requested times are validated now (Task 10) so an impossible session is refused early.
    """
    request_type = request_type or AttendanceCorrectionRequest.RequestType.CORRECTION
    if request_type not in CORRECTION_REQUEST_TYPES:
        raise AttendanceError("invalid_request_type", "Unsupported correction request type.")
    if not reason or not str(reason).strip():
        raise AttendanceError("reason_required", "A reason is required for a correction request.")
    types = AttendanceCorrectionRequest.RequestType
    record = _record_for(employee, work_date)
    if request_type == types.CORRECTION and not requested_clock_in and not requested_clock_out:
        raise AttendanceError(
            "nothing_requested", "Provide a corrected clock-in and/or clock-out time."
        )
    if request_type == types.LATE_CLOCK_IN_EXCEPTION and not requested_clock_in:
        raise AttendanceError(
            "clock_in_required", "A late clock-in exception needs the actual clock-in time."
        )
    if request_type == types.OVERTIME_AUTHORIZATION and not (record and record.clock_out):
        raise AttendanceError(
            "record_required",
            "Overtime authorization needs a completed attendance record for that day.",
        )
    policy = (record.policy if record else None) or get_policy(
        getattr(employee, "office_city", None) or DEFAULT_CITY
    )
    requested_clock_in = _aware(requested_clock_in, policy)
    requested_clock_out = _aware(requested_clock_out, policy)
    validate_session_times(work_date, *_effective_times(record, requested_clock_in, requested_clock_out),
                           policy=policy)
    return AttendanceCorrectionRequest.objects.create(
        employee=employee,
        record=record,
        work_date=work_date,
        request_type=request_type,
        overtime_minutes_requested=max(0, int(overtime_minutes_requested or 0)),
        requested_clock_in=requested_clock_in,
        requested_clock_out=requested_clock_out,
        reason=str(reason).strip()[:300],
        requested_by=requested_by,
    )


def _guard_review(correction, reviewed_by):
    if correction.status != AttendanceCorrectionRequest.Status.PENDING:
        raise AttendanceError("already_reviewed", "This correction request was already reviewed.")
    if reviewed_by is not None and correction.employee.user_id == getattr(reviewed_by, "pk", None):
        raise AttendanceError(
            "self_review_forbidden",
            "You cannot approve or reject a correction to your own attendance.",
        )


def approve_correction(correction, *, reviewed_by, note=""):
    """Apply an approved correction, preserving the original clock times.

    The original values are copied into ``clock_in_original`` / ``clock_out_original`` the
    first time a record is corrected, so the true history is never lost, and the record is
    stamped with who corrected it and when.
    """
    _guard_review(correction, reviewed_by)

    with transaction.atomic():
        record = correction.record or _record_for(correction.employee, correction.work_date)
        # Re-validate against the record as it is NOW (it may have changed since filing).
        validate_session_times(
            correction.work_date,
            *_effective_times(record, correction.requested_clock_in, correction.requested_clock_out),
            policy=(record.policy if record else None),
        )
        if record is None:
            record = AttendanceRecord(
                employee=correction.employee,
                work_date=correction.work_date,
                city=getattr(correction.employee, "office_city", None) or DEFAULT_CITY,
                policy=get_policy(getattr(correction.employee, "office_city", None) or DEFAULT_CITY),
            )
        if record.clock_in_original is None:
            record.clock_in_original = record.clock_in
        if record.clock_out_original is None:
            record.clock_out_original = record.clock_out

        if correction.requested_clock_in:
            record.clock_in = correction.requested_clock_in
            record.clock_in_source = AttendanceRecord.Source.MANUAL
        if correction.requested_clock_out:
            record.clock_out = correction.requested_clock_out
            record.clock_out_source = AttendanceRecord.Source.MANUAL

        # Request-type specific effects (official policy).
        if correction.request_type == AttendanceCorrectionRequest.RequestType.LATE_CLOCK_IN_EXCEPTION:
            # The blocked late clock-in is authorized, so the real work time is preserved.
            record.late_clock_in_exception = True
        if (
            correction.request_type
            == AttendanceCorrectionRequest.RequestType.OVERTIME_AUTHORIZATION
        ):
            # Management authorization — overtime is never approved automatically.
            record.overtime_approved = True
            record.overtime_approved_by = reviewed_by
            record.overtime_approved_at = timezone.now()

        record.corrected_by = reviewed_by
        record.corrected_at = timezone.now()
        record.missed_clock_out = False
        recalculate(record)
        record.save()

        correction.status = AttendanceCorrectionRequest.Status.APPROVED
        correction.reviewed_by = reviewed_by
        correction.reviewed_at = timezone.now()
        correction.review_note = str(note or "")[:300]
        correction.record = record
        correction.save()
    return correction


def reject_correction(correction, *, reviewed_by, note=""):
    """Reject a correction request. The attendance record is left exactly as it was."""
    _guard_review(correction, reviewed_by)
    correction.status = AttendanceCorrectionRequest.Status.REJECTED
    correction.reviewed_by = reviewed_by
    correction.reviewed_at = timezone.now()
    correction.review_note = str(note or "")[:300]
    correction.save()
    return correction


def flag_missed_clock_outs(day=None, now=None) -> int:
    """Flag (never silently fix) open records that are overdue for a clock-out.

    Overdue = still open more than MISSED_CLOCK_OUT_AFTER_MINUTES after the expected shift end
    (overnight shifts end the next day). ``day`` limits the sweep to one work date; by default
    every open record is checked, so a session left open on an earlier day is caught too.
    Idempotent: already-flagged records are skipped. Never invents a clock-out time.
    """
    moment = now or timezone.now()
    records = AttendanceRecord.objects.filter(
        clock_in__isnull=False, clock_out__isnull=True, missed_clock_out=False
    ).select_related("policy", "shift")
    if day is not None:
        records = records.filter(work_date=day)
    overdue = [r.pk for r in records if is_clock_out_overdue(r, now=moment)]
    if overdue:
        AttendanceRecord.objects.filter(pk__in=overdue).update(missed_clock_out=True)
    return len(overdue)


def attendance_sweep(now=None) -> dict:
    """Scheduler entry point (every minute): deadline flags + missed clock-outs.

    Both flags are idempotent updates on attendance rows — no notification is created here
    (clock-out reminders are dispatched and de-duplicated by break_notification_service), so
    running it every minute cannot produce duplicates.
    """
    moment = now or timezone.now()
    return {
        "deadline_flagged": flag_open_records_after_deadline(now=moment, day=False),
        "missed_clock_outs_flagged": flag_missed_clock_outs(now=moment),
    }


# ── Work schedules, approved leave and holidays ──────────────────────────────

def work_schedule_for(employee):
    """The employee's assigned work schedule, or ``None`` when unassigned."""
    from ..models import EmployeeWorkSchedule

    try:
        return employee.work_schedule
    except EmployeeWorkSchedule.DoesNotExist:
        return None


def employee_timezone(employee):
    """Timezone timestamps are *displayed* in for this employee (storage is always UTC).

    A remote employee abroad therefore sees their own local time while the company calendar
    and all reporting stay on Africa/Nouakchott.
    """
    schedule = work_schedule_for(employee)
    name = (schedule.timezone if schedule else "") or "Africa/Nouakchott"
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # pragma: no cover
        return policy_timezone()


def approved_leave_for(employee, day):
    """The approved leave record covering ``day`` for this employee, or ``None``."""
    from ..models import LeaveRecord

    return LeaveRecord.objects.filter(
        employee=employee,
        status=LeaveRecord.Status.APPROVED,
        start_date__lte=day,
        end_date__gte=day,
    ).first()


def on_approved_leave(day=None, city=None):
    """Employees on approved leave for ``day``, optionally filtered by office city."""
    from ..models import LeaveRecord

    day = day or local_day()
    queryset = LeaveRecord.objects.filter(
        status=LeaveRecord.Status.APPROVED, start_date__lte=day, end_date__gte=day
    ).select_related("employee")
    if city:
        queryset = queryset.filter(employee__office_city=city)
    return queryset


def holiday_for(day, city=None):
    """The active holiday for ``day`` (company-wide or matching the office city)."""
    from ..models import Holiday

    return (
        Holiday.objects.filter(date=day, is_active=True)
        .filter(Q(city="") | Q(city=city or ""))
        .first()
    )


def department_breakdown(day, city=None):
    """Per-department attendance for one day (present / late / remote / completed)."""
    buckets = {}
    for record in _records_for(day, city).select_related("employee"):
        department = record.employee.department or "Unassigned"
        bucket = buckets.setdefault(
            department,
            {
                "department": department,
                "present": 0,
                "late": 0,
                "remote": 0,
                "completed": 0,
                "overtime_minutes": 0,
            },
        )
        bucket["present"] += 1
        if record.late_minutes:
            bucket["late"] += 1
        if record.work_mode != "office":
            bucket["remote"] += 1
        if record.clock_out:
            bucket["completed"] += 1
        bucket["overtime_minutes"] += record.overtime_minutes or 0
    return sorted(buckets.values(), key=lambda item: item["department"])



def dashboard_summary(day=None, city=None):
    """The Attendance Management dashboard for one day, split by office and remote.

    Every figure is derived from real attendance rows (plus approved leave and holidays) —
    nothing is estimated or fabricated.
    """
    day = day or local_day()
    base = daily_dashboard(day, city)
    records = _records_for(day, city)
    working = records.filter(clock_in__isnull=False, clock_out__isnull=True)

    leave = on_approved_leave(day, city)
    holiday = holiday_for(day, city)
    total_employees = _expected_employees(city).count()
    # Approved leave is "away", not absent; holidays and non-workdays are not absences.
    absent = base["absent"]

    return {
        **base,
        "total_employees": total_employees,
        "office_working": working.filter(work_mode=AttendancePolicy.WorkMode.OFFICE).count(),
        "remote_working": working.exclude(work_mode=AttendancePolicy.WorkMode.OFFICE).count(),
        "on_break": AttendanceBreak.objects.filter(
            record__in=records, ended_at__isnull=True
        ).count(),
        "on_approved_leave": leave.count(),
        "absent": absent,
        "holiday": (
            {"date": holiday.date.isoformat(), "name": holiday.name} if holiday else None
        ),
        "departments": department_breakdown(day, city),
    }


def period_breakdown(start, end, city=None, group="department"):
    """Grouped attendance totals over a period: ``department`` | ``work_mode`` | ``office``."""
    records = AttendanceRecord.objects.filter(work_date__gte=start, work_date__lte=end)
    if city:
        records = records.filter(city=city)

    def key_for(record):
        if group == "work_mode":
            return record.work_mode or "office"
        if group == "office":
            return record.city or "Unassigned"
        return record.employee.department or "Unassigned"

    buckets = {}
    for record in records.select_related("employee"):
        key = key_for(record)
        bucket = buckets.setdefault(
            key,
            {
                "group": key,
                "records": 0,
                "present": 0,
                "late": 0,
                "completed": 0,
                "missed_clock_outs": 0,
                "worked_minutes": 0,
                "net_working_minutes": 0,
                "overtime_minutes": 0,
            },
        )
        bucket["records"] += 1
        if record.clock_in:
            bucket["present"] += 1
        if record.late_minutes:
            bucket["late"] += 1
        if record.clock_out:
            bucket["completed"] += 1
        if record.missed_clock_out:
            bucket["missed_clock_outs"] += 1
        bucket["worked_minutes"] += record.worked_minutes or 0
        bucket["net_working_minutes"] += record.net_working_minutes or 0
        bucket["overtime_minutes"] += record.overtime_minutes or 0
    return sorted(buckets.values(), key=lambda item: item["group"])


def export_rows(start, end, city=None, work_mode=None):
    """Flat rows for CSV/PDF export — one row per attendance record.

    Personal data is limited to what an attendance report needs (name, employee number,
    department, office): no date of birth, no national ID, no contact details.
    """
    records = AttendanceRecord.objects.filter(
        work_date__gte=start, work_date__lte=end
    ).select_related("employee")
    if city:
        records = records.filter(city=city)
    if work_mode:
        records = records.filter(work_mode=work_mode)

    rows = []
    for record in records.order_by("work_date", "employee__employee_number"):
        tz = employee_timezone(record.employee)

        def _stamp(value):
            return value.astimezone(tz).strftime("%Y-%m-%d %H:%M") if value else ""

        rows.append(
            {
                "work_date": record.work_date.isoformat(),
                "employee_number": record.employee.employee_number,
                "employee_name": record.employee.full_name,
                "department": record.employee.department or "",
                "office": record.city,
                "work_mode": record.work_mode,
                "work_location": record.work_location,
                "clock_in": _stamp(record.clock_in),
                "clock_out": _stamp(record.clock_out),
                "break_minutes": record.break_minutes,
                "unpaid_break_minutes": record.unpaid_break_minutes,
                "worked_minutes": record.worked_minutes,
                "net_working_minutes": record.net_working_minutes,
                "overtime_minutes": record.overtime_minutes,
                "status": record.status,
                "late_minutes": record.late_minutes,
                "missed_clock_out": record.missed_clock_out,
                "corrected": bool(record.corrected_at),
            }
        )
    return rows


# ── Official Yala attendance policy helpers (Founder/CEO) ────────────────────

#: The three scheduled clock-out notifications, keyed by local minute-of-day.
#: Each entry carries the ``BreakNotification.Kind`` it is stored under, so the reminder can be
#: dispatched and de-duplicated like the break notifications instead of being computed ad hoc.
CLOCK_OUT_MESSAGES = {
    16 * 60 + 55: (
        "clock_out_reminder",
        "Your workday ends at 5:00 PM. Please prepare to clock out.",
    ),
    17 * 60: (
        "clock_out_due",
        "Your scheduled workday has ended. Please clock out.",
    ),
    17 * 60 + 5: (
        "clock_out_deadline",
        "Your clock-out deadline has passed. Your attendance has been flagged for HR review.",
    ),
}


def clock_out_reminders(now=None):
    """The clock-out notification due right now for employees still clocked in.

    Implements the three scheduled messages (16:55, 17:00, 17:05). Returns one entry per
    employee still clocked in; the caller delivers them (portal/email/SMS). Nothing is
    fabricated and this helper sends nothing itself, so it is safe to poll.
    """
    # Task 10: records with an assigned shift get their reminders at shift end − 5 min, shift
    # end and the shift deadline (overnight shifts end the next day). Records without a shift
    # keep the exact policy schedule and wording above.
    policy = get_policy()
    moment = now or timezone.now()
    local = local_now(now=moment, policy=policy)
    minute = moment.replace(second=0, microsecond=0)
    default_entry = CLOCK_OUT_MESSAGES.get(local.hour * 60 + local.minute)
    open_records = AttendanceRecord.objects.filter(
        clock_in__isnull=False, clock_out__isnull=True
    ).select_related("employee", "shift", "policy")

    reminders = []
    for record in open_records:
        if record.shift is None:
            if not default_entry or record.work_date != local.date():
                continue
            kind, message = default_entry
        else:
            record_policy = record.policy or policy
            _, end = expected_window(record.work_date, record_policy, record.shift)
            end_text = local_now(now=end, policy=record_policy).strftime("%H:%M")
            schedule = {
                end - timedelta(minutes=5): (
                    "clock_out_reminder", f"Your shift ends at {end_text}. Please prepare to clock out."),
                end: ("clock_out_due", "Your scheduled shift has ended. Please clock out."),
                clock_out_deadline(record, record_policy): (
                    "clock_out_deadline",
                    "Your clock-out deadline has passed. Your attendance has been flagged for HR review.",
                ),
            }
            if minute not in schedule:
                continue
            kind, message = schedule[minute]
        reminders.append(
            {
                "employee_number": record.employee.employee_number,
                "employee_name": record.employee.full_name,
                "kind": kind,
                "message": message,
                "due_at": local.replace(second=0, microsecond=0),
            }
        )
    return reminders



def flag_open_records_after_deadline(day=None, now=None):
    """Flag employees still clocked in after the 17:05 deadline. Returns the count.

    Flagging never invents a clock-out time and never caps the hours worked.
    """
    # Task 10: the deadline is per record (assigned shift, incl. overnight) instead of one
    # company-wide 17:05. ``day=None`` keeps the old meaning (today's work date); ``day=False``
    # checks every open record (used by the scheduler sweep).
    moment = now or timezone.now()
    records = AttendanceRecord.objects.filter(
        clock_in__isnull=False,
        clock_out__isnull=True,
        flagged_after_deadline=False,
    ).select_related("policy", "shift")
    if day is None:
        day = local_day(now=moment, policy=get_policy())
    if day is not False:
        records = records.filter(work_date=day)
    count = 0
    for record in records:
        deadline = clock_out_deadline(record)
        if moment <= deadline:
            continue
        deadline_local = local_now(now=deadline, policy=record.policy).strftime("%H:%M")
        AttendanceRecord.objects.filter(pk=record.pk, flagged_after_deadline=False).update(
            flagged_after_deadline=True,
            flag_reason=f"Still clocked in after the {deadline_local} deadline.",
            flagged_at=moment,
        )
        count += 1
    return count


def authorize_overtime(record, *, approved_by, approve=True):
    """Management authorization for overtime. Never automatic, never implied."""
    record.overtime_approved = bool(approve)
    record.overtime_approved_by = approved_by if approve else None
    record.overtime_approved_at = timezone.now() if approve else None
    record.save(
        update_fields=[
            "overtime_approved",
            "overtime_approved_by",
            "overtime_approved_at",
            "updated_at",
        ]
    )
    return record


def policy_dashboard(day=None, city=None):
    """CEO policy dashboard: every figure required by the official attendance policy."""
    policy = get_policy(city or DEFAULT_CITY)
    day = day or local_day(policy=policy)
    records = _records_for(day, city)
    clocked_in = records.filter(clock_in__isnull=False).count()
    still_in = records.filter(clock_in__isnull=False, clock_out__isnull=True)
    breaks = AttendanceBreak.objects.filter(record__in=records)
    leave_count = on_approved_leave(day, city).count()

    return {
        "date": day,
        "city": city or "",
        "policy": {
            "official_start": policy.shift_start.strftime("%H:%M"),
            "latest_clock_in": policy.latest_clock_in.strftime("%H:%M"),
            "official_end": policy.shift_end.strftime("%H:%M"),
            "latest_clock_out": policy.latest_clock_out.strftime("%H:%M"),
            "breakfast": f"{policy.breakfast_start:%H:%M}-{policy.breakfast_end:%H:%M}",
            "lunch": f"{policy.lunch_start:%H:%M}-{policy.lunch_end:%H:%M}",
            "overtime_requires_authorization": policy.overtime_requires_authorization,
            "timezone": policy.timezone,
        },
        "employees_clocked_in": clocked_in,
        "employees_clocked_out": records.filter(clock_out__isnull=False).count(),
        "late_arrivals": records.filter(late_minutes__gt=0).count(),
        # Employees expected but with no clock-in at all today.
        # Scheduled employees with no clock-in and no approved leave (holidays/non-workdays excluded).
        "missed_clock_ins": len(absent_employee_ids(day, city)),
        "breakfast_taken": breaks.filter(break_type=AttendanceBreak.BreakType.BREAKFAST)
        .values("record")
        .distinct()
        .count(),
        "lunch_taken": breaks.filter(break_type=AttendanceBreak.BreakType.LUNCH)
        .values("record")
        .distinct()
        .count(),
        "still_clocked_in_after_deadline": still_in.filter(flagged_after_deadline=True).count(),
        "flagged_records": records.filter(flagged_after_deadline=True).count(),
        "unauthorized_overtime_alerts": [
            {
                "employee_number": record.employee.employee_number,
                "employee_name": record.employee.full_name,
                "overtime_minutes": record.overtime_minutes,
                "compensation_minutes": record.compensation_minutes,
                "flag_reason": record.flag_reason,
            }
            for record in records.filter(
                overtime_minutes__gt=0, overtime_approved=False
            ).select_related("employee")[:50]
        ],
        "exception_requests": [
            {
                "id": row.id,
                "employee_number": row.employee.employee_number,
                "employee_name": row.employee.full_name,
                "request_type": row.request_type,
                "work_date": row.work_date.isoformat(),
                "reason": row.reason,
                "status": row.status,
            }
            for row in AttendanceCorrectionRequest.objects.filter(
                request_type__in=[
                    AttendanceCorrectionRequest.RequestType.LATE_CLOCK_IN_EXCEPTION,
                    AttendanceCorrectionRequest.RequestType.OVERTIME_AUTHORIZATION,
                ]
            ).select_related("employee")[:50]
        ],
    }
