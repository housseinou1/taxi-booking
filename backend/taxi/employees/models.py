"""Employee Management data foundation (Phase 1 — backend models only).

Scope note: these models define the schema and the permanent employee-number
generator. RBAC, audit integration, photo upload/serving, QR verification,
PDF cards, and card activation workflows are explicitly OUT of scope for
Phase 1 and are added in later phases.
"""

import datetime
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

# ID cards are valid for exactly one calendar year from the issue date.
CARD_VALIDITY_YEARS = 1


def add_calendar_year(start, years: int = CARD_VALIDITY_YEARS):
    """Return ``start`` advanced by ``years`` calendar year(s).

    Uses calendar-year arithmetic (same month/day, year + N) rather than a
    fixed 365-day delta, so an ID issued on 15/10/2026 expires on 15/10/2027.
    Feb 29 is handled consistently: a card issued on 29/02 of a leap year
    expires on 28/02 of the following (non-leap) year, since 29/02 does not
    exist then. Works for both ``date`` and ``datetime`` (tz-aware preserved).
    """
    try:
        return start.replace(year=start.year + years)
    except ValueError:
        # start is Feb 29 and the target year is not a leap year -> use Feb 28.
        return start.replace(year=start.year + years, day=28)

# Employee-number format: fixed prefix + zero-padded sequence (min width 4) +
# fixed suffix. Examples: YAM110001LAR, YAM110002LAR ... YAM119999LAR,
# YAM1110000LAR (widens naturally past 9999 — never resets, never reused).
EMPLOYEE_NUMBER_PREFIX = "YAM11"
EMPLOYEE_NUMBER_SUFFIX = "LAR"
EMPLOYEE_NUMBER_PAD = 4


def format_employee_number(sequence: int) -> str:
    """Render a sequence integer (1-based) as an official employee number."""
    if sequence < 1:
        raise ValueError("Employee number sequence must be >= 1.")
    return f"{EMPLOYEE_NUMBER_PREFIX}{sequence:0{EMPLOYEE_NUMBER_PAD}d}{EMPLOYEE_NUMBER_SUFFIX}"


class EmploymentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    SUSPENDED = "suspended", "Suspended"
    TERMINATED = "terminated", "Terminated"


class CardStatus(models.TextChoices):
    VALID = "valid", "Valid"
    EXPIRED = "expired", "Expired"
    DEACTIVATED = "deactivated", "Deactivated"
    REPLACED = "replaced", "Replaced"
    REVOKED = "revoked", "Revoked"


class EmployeeNumberCounter(models.Model):
    """Single-row monotonic counter for concurrency-safe employee-number
    allocation.

    A dedicated counter row (rather than MAX(employee_number)) gives a stable
    target for ``select_for_update()`` on PostgreSQL and guarantees the sequence
    never resets or reuses values even if employees are later removed. The
    canonical row uses ``pk=1`` (see services.number_service).
    """

    current_value = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Employee number counter"
        verbose_name_plural = "Employee number counter"

    def __str__(self):
        return f"EmployeeNumberCounter(current_value={self.current_value})"


class StaffEmployee(models.Model):
    """A Yala Technologies staff employee.

    Distinct from ``features.CorporateEmployee`` (which represents a member of a
    corporate ride account — a customer, not Yala staff).
    """

    # Permanent, unique, never reused, never changed on card replacement.
    employee_number = models.CharField(
        max_length=32,
        unique=True,
        editable=False,
        help_text="Permanent official employee number, e.g. YAM110001LAR.",
    )

    full_name = models.CharField(max_length=200)
    date_of_birth = models.DateField(null=True, blank=True)
    department = models.CharField(max_length=120, blank=True, default="")
    job_title = models.CharField(max_length=120, blank=True, default="")
    employment_start_date = models.DateField(null=True, blank=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
    )

    # Optional link to an existing app account. Many staff may have no User.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_employee",
    )

    # Phase 1: metadata reference only. No FileField, no public media storage,
    # and no upload endpoint yet — protected photo storage arrives in a later
    # phase. This stores an opaque storage key (e.g. a UUID filename) once the
    # protected-storage layer exists; null until then.
    photo_key = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Opaque reference to a protected photo asset (metadata only in Phase 1).",
    )

    # ── Electronic signature (Founder/CEO directive) ──────────────────────────
    # The employee's own signature, captured on a signature pad or uploaded as an image by an
    # authorized administrator acting on a signature the employee provided. Yala never
    # generates or imitates a signature: these fields only ever reference an asset that was
    # supplied. Stored as an opaque key into protected storage (same posture as photo_key),
    # so no public media URL can ever expose it.
    signature_key = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Opaque reference to the protected signature asset (never a public URL).",
    )
    signature_source = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[("pad", "Captured on signature pad"), ("upload", "Uploaded image")],
        help_text="How the signature was supplied: signature pad or uploaded image.",
    )
    signature_consent_confirmed = models.BooleanField(
        default=False,
        help_text=(
            "The signature was provided or approved by the employee. Required before a "
            "signature can be stored; never set automatically."
        ),
    )
    signature_provided_at = models.DateTimeField(null=True, blank=True)
    signature_provided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_signatures_recorded",
        help_text="Administrator who recorded the employee-provided signature.",
    )

    # Office the employee reports to. Required for per-city attendance reporting
    # (Nouakchott / Nouadhibou) — attendance itself lives in AttendanceRecord.
    office_city = models.CharField(
        max_length=60,
        default="Nouakchott",
        db_index=True,
        help_text="Office city the employee reports to (Nouakchott or Nouadhibou).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee_number"]
        indexes = [
            models.Index(fields=["employment_status"], name="emp_status_idx"),
            models.Index(fields=["department"], name="emp_department_idx"),
        ]

    def __str__(self):
        return f"{self.employee_number} — {self.full_name}"


class EmployeeIDCard(models.Model):
    """A physical employee ID card.

    The employee number identifies the employee; each physical card has its own
    unique ``card_number`` and ``qr_uuid``. Renewing/replacing a card issues a
    new card but never changes the employee's ``employee_number``.
    """

    employee = models.ForeignKey(
        StaffEmployee,
        on_delete=models.CASCADE,
        related_name="id_cards",
    )

    # Per-physical-card unique identifier, distinct from the employee number.
    card_number = models.CharField(max_length=40, unique=True, editable=False)

    # Opaque verification handle; never expose the DB PK publicly.
    qr_uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    status = models.CharField(
        max_length=20,
        choices=CardStatus.choices,
        default=CardStatus.VALID,
    )

    # Annual validity window. expires_at is exactly one calendar year after
    # issued_at (see save()/issue()); e.g. issued 15/10/2026 -> 15/10/2027.
    issued_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Renewal bookkeeping. renewed_at is set when this card is issued as the
    # renewal of a prior card; renewal_count is 0 for an original card and
    # increments down the renewal chain. previous_card points back to the card
    # this one renews/replaces (the inverse of replaced_by's chain).
    renewed_at = models.DateTimeField(null=True, blank=True)
    renewal_count = models.PositiveIntegerField(default=0)
    previous_card = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="renewed_as",
    )

    # Renew/replace chain: the card that supersedes this one.
    replaced_by = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replaces",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"], name="card_status_idx"),
            models.Index(fields=["employee", "-created_at"], name="card_employee_idx"),
        ]

    def save(self, *args, **kwargs):
        # Auto-compute the annual expiry exactly one calendar year after issue
        # when an issue date is present and no explicit expiry was supplied.
        if self.issued_at and not self.expires_at:
            self.expires_at = add_calendar_year(self.issued_at)
        super().save(*args, **kwargs)

    def is_expired(self, now=None) -> bool:
        """True when the card is past its expiration date."""
        if not self.expires_at:
            return False
        now = now or timezone.now()
        return now >= self.expires_at

    def is_valid(self, now=None) -> bool:
        """True only when the card is currently usable.

        A card is valid when its status is VALID and it has not expired.
        Deactivated / replaced / revoked / expired cards are never valid. This
        is the single source of truth the (future) QR verification endpoint
        must consult before reporting "valid".
        """
        if self.status != CardStatus.VALID:
            return False
        return not self.is_expired(now=now)

    def __str__(self):
        return f"Card {self.card_number} ({self.get_status_display()}) — {self.employee.employee_number}"


class CardVerificationRecord(models.Model):
    """Audit/scan history for public card verification.

    Phase 1 defines the schema only; the public verification endpoint that
    writes these records is implemented in a later phase.
    """

    card = models.ForeignKey(
        EmployeeIDCard,
        on_delete=models.CASCADE,
        related_name="verification_records",
    )
    # Status reported to the scanner at verification time.
    result_status = models.CharField(max_length=20, choices=CardStatus.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["card", "-created_at"], name="cardverif_card_idx"),
        ]

    def __str__(self):
        return f"Verify {self.card.card_number} -> {self.result_status} @ {self.created_at:%Y-%m-%d %H:%M}"


# ══════════════════════════════════════════════════════════════════════════════
# Employee attendance & time tracking (Founder/CEO directive)
#
# Design rules encoded in this schema:
# * Attendance belongs to the EXISTING HR app — no second HR system is created.
# * Original clock times are preserved: corrections never silently overwrite them
#   (``clock_in_original`` / ``clock_out_original`` + ``corrected_by`` / ``corrected_at``).
# * Every timestamp is stored server-side (``timezone.now()``, UTC) and rendered in
#   ``Africa/Nouakchott`` (the project TIME_ZONE) for reporting.
# * Policies are configurable rows, never hard-coded constants.
# * Nothing here deducts salary or performs any financial operation.
# ══════════════════════════════════════════════════════════════════════════════

#: Cities the company operates staff attendance in (Founder/CEO directive).
ATTENDANCE_CITIES = ("Nouakchott", "Nouadhibou")


class AttendancePolicy(models.Model):
    """Configurable company attendance policy (per office/city).

    Times are local wall-clock times in ``timezone`` (Africa/Nouakchott), which is how the
    company states shifts ("08:00–17:00"). Comparisons at runtime convert the employee's
    local shift start into an aware datetime before comparing with the stored UTC timestamp.
    """

    name = models.CharField(max_length=120, default="Standard office policy")
    city = models.CharField(max_length=60, default="Nouakchott", db_index=True)
    is_active = models.BooleanField(default=True)

    shift_start = models.TimeField(default=datetime.time(8, 0))
    shift_end = models.TimeField(default=datetime.time(17, 0))
    #: Arriving later than shift_start + grace is a late arrival.
    grace_minutes = models.PositiveIntegerField(default=10)
    #: Paid break allowance; breaks beyond this are still recorded but flagged.
    break_allowance_minutes = models.PositiveIntegerField(default=60)
    #: Minutes of presence that count as a full day.
    standard_work_minutes = models.PositiveIntegerField(default=480)
    #: Minutes after which extra presence counts as overtime.
    overtime_after_minutes = models.PositiveIntegerField(default=480)
    #: Working weekdays, Monday=0 .. Sunday=6. Default Mon–Fri.
    workdays = models.JSONField(default=list, blank=True)
    timezone = models.CharField(max_length=64, default="Africa/Nouakchott")

    # ── Schedule + work-mode policy (Founder/CEO directive) ───────────────────
    class ScheduleType(models.TextChoices):
        FULL_TIME = "full_time", "Full-time"
        PART_TIME = "part_time", "Part-time"
        FLEXIBLE = "flexible", "Flexible shifts"

    class WorkMode(models.TextChoices):
        OFFICE = "office", "Office-based"
        REMOTE = "remote", "Remote"
        HYBRID = "hybrid", "Hybrid"

    schedule_type = models.CharField(
        max_length=20, choices=ScheduleType.choices, default=ScheduleType.FULL_TIME
    )
    work_mode = models.CharField(
        max_length=20, choices=WorkMode.choices, default=WorkMode.OFFICE
    )
    #: Break time inside this allowance is paid; anything beyond it is unpaid.
    #: Net working hours = gross presence − unpaid break minutes.
    paid_break_minutes = models.PositiveIntegerField(default=60)

    # ── Official Yala attendance policy (Founder/CEO) ─────────────────────────
    # Official start 08:00; a normal clock-in is BLOCKED after 08:15 and must go through an
    # HR exception request. Official end 17:00 with a 17:05 grace deadline; a later clock-out
    # flags the record and never auto-approves overtime.
    latest_clock_in = models.TimeField(default=datetime.time(8, 15))
    latest_clock_out = models.TimeField(default=datetime.time(17, 5))

    breakfast_start = models.TimeField(default=datetime.time(10, 0))
    breakfast_end = models.TimeField(default=datetime.time(10, 30))
    lunch_start = models.TimeField(default=datetime.time(13, 0))
    lunch_end = models.TimeField(default=datetime.time(14, 0))

    #: Overtime is never auto-approved: management authorization is required.
    overtime_requires_authorization = models.BooleanField(default=True)
    #: When false (default) a clock-in after ``latest_clock_in`` is refused.
    allow_late_clock_in = models.BooleanField(default=False)
    #: Minutes after the official end at which the record is flagged (17:00 + 5).
    clock_out_flag_after_minutes = models.PositiveIntegerField(default=5)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["city", "name"]
        verbose_name = "Attendance policy"
        verbose_name_plural = "Attendance policies"

    def __str__(self):
        return f"{self.name} ({self.city}) {self.shift_start:%H:%M}-{self.shift_end:%H:%M}"

    @property
    def effective_workdays(self):
        return self.workdays or [0, 1, 2, 3, 4]

    def is_workday(self, day) -> bool:
        """True when ``day`` (a date) is a scheduled working day for this policy."""
        return day.weekday() in self.effective_workdays


class ShiftAssignment(models.Model):
    """A planned shift for one employee on one date (shift scheduling)."""

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="shift_assignments"
    )
    policy = models.ForeignKey(
        AttendancePolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_assignments",
    )
    work_date = models.DateField(db_index=True)
    city = models.CharField(max_length=60, default="Nouakchott", db_index=True)
    start_time = models.TimeField(default=datetime.time(8, 0))
    end_time = models.TimeField(default=datetime.time(17, 0))
    notes = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_shift_assignments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-work_date", "employee__employee_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "work_date"], name="unique_employee_shift_per_day"
            ),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.work_date} {self.start_time:%H:%M}-{self.end_time:%H:%M}"




class AttendanceRecord(models.Model):
    """One employee's attendance for one working day.

    ``clock_in`` / ``clock_out`` hold the CURRENT effective values; the original values are
    kept in ``clock_in_original`` / ``clock_out_original`` so an approved correction can never
    erase what actually happened. All timestamps are server-side (UTC).
    """

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        LATE = "late", "Late arrival"
        ABSENT = "absent", "Absent"
        HALF_DAY = "half_day", "Half day"
        ON_LEAVE = "on_leave", "On leave"
        HOLIDAY = "holiday", "Holiday"

    class Source(models.TextChoices):
        PORTAL = "portal", "Employee portal"
        TABLET = "tablet", "Office attendance tablet"
        QR = "qr", "Employee ID card QR"
        MANUAL = "manual", "HR correction"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="attendance_records"
    )
    work_date = models.DateField(db_index=True)
    city = models.CharField(max_length=60, default="Nouakchott", db_index=True)
    policy = models.ForeignKey(
        AttendancePolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_records",
    )
    shift = models.ForeignKey(
        ShiftAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_records",
    )

    clock_in = models.DateTimeField(null=True, blank=True)
    clock_out = models.DateTimeField(null=True, blank=True)
    clock_in_source = models.CharField(max_length=20, choices=Source.choices, blank=True, default="")
    clock_out_source = models.CharField(max_length=20, choices=Source.choices, blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PRESENT)
    late_minutes = models.PositiveIntegerField(default=0)
    break_minutes = models.PositiveIntegerField(default=0)
    worked_minutes = models.PositiveIntegerField(default=0)
    overtime_minutes = models.PositiveIntegerField(default=0)

    #: Clocked in but never clocked out (flagged for HR follow-up).
    missed_clock_out = models.BooleanField(default=False)
    #: Break time beyond the policy allowance (recorded, not deducted automatically).
    break_over_allowance = models.BooleanField(default=False)

    # ── Remote / office attendance (Founder/CEO directive) ────────────────────
    # Recorded per day so the dashboard can separate office and remote work without
    # any GPS or continuous location tracking.
    work_mode = models.CharField(
        max_length=20,
        choices=AttendancePolicy.WorkMode.choices,
        default=AttendancePolicy.WorkMode.OFFICE,
        db_index=True,
    )
    #: The employee's stated work arrangement for the day (e.g. "Home — Tevragh Zeina",
    #: "Nouakchott office", "Client site"). Free text the employee/HR provides; no tracking.
    work_location = models.CharField(max_length=160, blank=True, default="")
    #: Unpaid break minutes (break beyond the paid allowance). Paid breaks are not deducted.
    unpaid_break_minutes = models.PositiveIntegerField(default=0)
    #: Net working hours = gross presence − unpaid break minutes.
    net_working_minutes = models.PositiveIntegerField(default=0)

    # ── Deadline flagging + overtime authorization (Founder/CEO) ──────────────
    #: Clocked out after the 17:05 deadline (or still open past it): flagged for HR review.
    flagged_after_deadline = models.BooleanField(default=False)
    flag_reason = models.CharField(max_length=200, blank=True, default="")
    flagged_at = models.DateTimeField(null=True, blank=True)
    #: Overtime is recorded as worked time but is NEVER auto-approved.
    overtime_approved = models.BooleanField(default=False)
    overtime_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_attendance_overtime",
    )
    overtime_approved_at = models.DateTimeField(null=True, blank=True)
    #: Compensation is computed from the ACTUAL hours worked, independently of whether the
    #: overtime was authorized — so unauthorised overtime is never erased or capped here.
    compensation_minutes = models.PositiveIntegerField(default=0)
    #: Set when a blocked late clock-in was allowed through an approved HR exception.
    late_clock_in_exception = models.BooleanField(default=False)

    notes = models.CharField(max_length=300, blank=True, default="")

    # ── Correction traceability (originals are never destroyed) ───────────────
    clock_in_original = models.DateTimeField(null=True, blank=True)
    clock_out_original = models.DateTimeField(null=True, blank=True)
    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corrected_attendance_records",
    )
    corrected_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-work_date", "employee__employee_number"]
        constraints = [
            # One attendance row per employee per day: the database itself prevents a
            # duplicate clock-in from ever creating a second record.
            models.UniqueConstraint(
                fields=["employee", "work_date"], name="unique_employee_attendance_day"
            ),
        ]
        indexes = [
            models.Index(fields=["work_date", "city"], name="attendance_date_city_idx"),
            models.Index(fields=["employee", "-work_date"], name="attendance_emp_date_idx"),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.work_date} ({self.status})"

    @property
    def is_open(self) -> bool:
        """True when the employee is currently clocked in and not yet clocked out."""
        return bool(self.clock_in) and not self.clock_out


class AttendanceBreak(models.Model):
    """A recorded break. Append-only: end_break() closes a row, never deletes it."""

    class BreakType(models.TextChoices):
        BREAKFAST = "breakfast", "Breakfast (10:00-10:30)"
        LUNCH = "lunch", "Lunch (13:00-14:00)"
        OTHER = "other", "Other break"

    record = models.ForeignKey(
        AttendanceRecord, on_delete=models.CASCADE, related_name="breaks"
    )
    #: Scheduled break this row belongs to. Employees must record the start AND end of both
    #: scheduled breaks, so HR can see breakfast and lunch attendance per day.
    break_type = models.CharField(
        max_length=20, choices=BreakType.choices, default=BreakType.OTHER, db_index=True
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    minutes = models.PositiveIntegerField(default=0)
    source = models.CharField(
        max_length=20, choices=AttendanceRecord.Source.choices, default="portal"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["started_at"]
        indexes = [models.Index(fields=["record", "started_at"], name="attendance_break_idx")]



class AttendanceCorrectionRequest(models.Model):
    """Employee-initiated attendance correction, approved or rejected by HR.

    The request is a separate record, so approving it never destroys the original attendance
    row: the service writes the approved values onto the record while keeping
    ``clock_in_original`` / ``clock_out_original`` and stamping who corrected it and when.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class RequestType(models.TextChoices):
        CORRECTION = "correction", "Attendance correction"
        #: A clock-in after 08:15 is blocked; HR may approve an exception so the actual hours
        #: the employee worked are still recorded.
        LATE_CLOCK_IN_EXCEPTION = "late_clock_in_exception", "Late clock-in exception"
        #: Overtime is never auto-approved — management authorizes it explicitly.
        OVERTIME_AUTHORIZATION = "overtime_authorization", "Overtime authorization"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="attendance_corrections"
    )
    request_type = models.CharField(
        max_length=30, choices=RequestType.choices, default=RequestType.CORRECTION, db_index=True
    )
    #: For overtime authorization requests: the overtime the manager is approving.
    overtime_minutes_requested = models.PositiveIntegerField(default=0)
    record = models.ForeignKey(
        AttendanceRecord,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="correction_requests",
    )
    work_date = models.DateField(db_index=True)
    requested_clock_in = models.DateTimeField(null=True, blank=True)
    requested_clock_out = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=300)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_attendance_corrections",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_attendance_corrections",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="attendance_corr_status_idx"),
            models.Index(fields=["employee", "-work_date"], name="attendance_corr_emp_idx"),
        ]

    def __str__(self):
        return f"Correction {self.employee.employee_number} {self.work_date} ({self.status})"

    def __str__(self):
        if self.ended_at:
            return f"Break {self.started_at:%H:%M}-{self.ended_at:%H:%M}"
        return f"Break from {self.started_at:%H:%M}"



# ══════════════════════════════════════════════════════════════════════════════
# Work schedules, approved leave and holidays (Founder/CEO directive)
# ══════════════════════════════════════════════════════════════════════════════


class EmployeeWorkSchedule(models.Model):
    """An employee's assigned work schedule / approved flexible arrangement.

    One row per employee. The employee's ``timezone`` is what timestamps are *displayed* in
    (UTC is always what is stored), so a remote employee in another country sees their own
    local time without changing the company reporting calendar.
    """

    employee = models.OneToOneField(
        StaffEmployee, on_delete=models.CASCADE, related_name="work_schedule"
    )
    policy = models.ForeignKey(
        AttendancePolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_schedules",
    )
    schedule_type = models.CharField(
        max_length=20,
        choices=AttendancePolicy.ScheduleType.choices,
        default=AttendancePolicy.ScheduleType.FULL_TIME,
    )
    work_mode = models.CharField(
        max_length=20,
        choices=AttendancePolicy.WorkMode.choices,
        default=AttendancePolicy.WorkMode.OFFICE,
    )
    #: Approved arrangement, e.g. "Remote — Dakar, Senegal" or "Hybrid: Mon/Wed in office".
    arrangement = models.CharField(max_length=200, blank=True, default="")
    timezone = models.CharField(max_length=64, default="Africa/Nouakchott")
    effective_from = models.DateField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_work_schedules",
    )
    notes = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee__employee_number"]
        verbose_name = "Employee work schedule"
        verbose_name_plural = "Employee work schedules"

    def __str__(self):
        return (
            f"{self.employee.employee_number} "
            f"{self.get_schedule_type_display()} / {self.get_work_mode_display()}"
        )


class LeaveRecord(models.Model):
    """Approved (or requested) leave. Approved leave counts as away, not absent."""

    class LeaveType(models.TextChoices):
        ANNUAL = "annual", "Annual leave"
        SICK = "sick", "Sick leave"
        UNPAID = "unpaid", "Unpaid leave"
        PARENTAL = "parental", "Parental leave"
        OTHER = "other", "Other approved leave"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="leave_records"
    )
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices, default=LeaveType.ANNUAL)
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reason = models.CharField(max_length=300, blank=True, default="")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_leave_records",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_leave_records",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]
        indexes = [
            models.Index(fields=["start_date", "end_date"], name="leave_period_idx"),
            models.Index(fields=["status", "start_date"], name="leave_status_idx"),
        ]

    def __str__(self):
        return (
            f"{self.employee.employee_number} {self.leave_type} "
            f"{self.start_date}..{self.end_date} ({self.status})"
        )

    def covers(self, day) -> bool:
        return self.status == self.Status.APPROVED and self.start_date <= day <= self.end_date


class Holiday(models.Model):
    """A company holiday. A blank ``city`` means it applies to every office."""

    date = models.DateField(db_index=True)
    name = models.CharField(max_length=160)
    city = models.CharField(max_length=60, blank=True, default="", db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["date", "name", "city"], name="unique_holiday"),
        ]

    def __str__(self):
        return f"{self.date} {self.name}" + (f" ({self.city})" if self.city else " (all offices)")


# ══════════════════════════════════════════════════════════════════════════════
# Discipline, performance, development and HR workflow records (Founder/CEO)
#
# Design rules encoded here:
# * Nothing in this schema disciplines, penalises or pays anyone automatically. Every
#   disciplinary, performance and training record is created by a named human being, carries
#   the employee's own response where applicable, and keeps a full audit trail.
# * No payroll calculation, no wage deduction, no automatic bonus.
# * Sensitive HR data (discipline, performance) is never exposed publicly.
# ══════════════════════════════════════════════════════════════════════════════


class ExitPermissionRequest(models.Model):
    """Mandatory: permission to leave the office during working hours.

    Prevents an employee from clocking in and then conducting personal business off-site.
    Emergency departures are supported (``is_emergency``) and an unauthorized departure can be
    documented by a supervisor and referred to HR — never inferred automatically.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="exit_requests"
    )
    department = models.CharField(max_length=120, blank=True, default="")
    date = models.DateField(db_index=True)
    requested_departure = models.TimeField()
    expected_return = models.TimeField()
    reason = models.CharField(max_length=300)
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_exit_requests",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    is_emergency = models.BooleanField(default=False)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_exit_permissions",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_exit_permissions",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True, default="")

    # ── Actual movement ──────────────────────────────────────────────────────
    actual_departure = models.DateTimeField(null=True, blank=True)
    actual_return = models.DateTimeField(null=True, blank=True)
    minutes_away = models.PositiveIntegerField(default=0)

    # ── Unauthorized departure documentation (supervisor, then HR review) ────
    unauthorized = models.BooleanField(default=False)
    documented_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documented_unauthorized_departures",
    )
    documented_at = models.DateTimeField(null=True, blank=True)
    incident_note = models.CharField(max_length=300, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["status", "date"], name="exit_status_date_idx"),
            models.Index(fields=["employee", "-date"], name="exit_employee_date_idx"),
        ]

    def __str__(self):
        return (
            f"{self.employee.employee_number} {self.date} "
            f"{self.requested_departure}-{self.expected_return} ({self.status})"
        )


class AbsenceNotification(models.Model):
    """Report absence / emergency (call-out). No medical detail is ever required."""

    class Category(models.TextChoices):
        ILLNESS = "illness", "Illness"
        FAMILY_EMERGENCY = "family_emergency", "Family emergency"
        ACCIDENT = "accident", "Accident"
        TRANSPORTATION = "transportation", "Transportation emergency"
        APPROVED_LEAVE = "approved_leave", "Approved personal leave"
        OTHER = "other", "Other legitimate circumstances"

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        ACKNOWLEDGED = "acknowledged", "Acknowledged by supervisor"
        UNDER_REVIEW = "under_review", "Under HR review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="absence_notifications"
    )
    date = models.DateField(db_index=True)
    notified_at = models.DateTimeField()
    category = models.CharField(max_length=30, choices=Category.choices, default=Category.ILLNESS)
    #: General reason only — the employee is never required to disclose medical details.
    reason = models.CharField(max_length=300, blank=True, default="")
    expected_return_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)

    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_absence_notifications",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_absence_notifications",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "date"], name="unique_absence_notification_day"
            ),
        ]
        indexes = [models.Index(fields=["status", "date"], name="absence_status_idx")]

    def __str__(self):
        return f"{self.employee.employee_number} {self.date} ({self.category})"

class DisciplineCase(models.Model):
    """HR discipline case. Nothing here disciplines anyone automatically.

    A software flag may *prompt* a case, but the case requires a named opener, documented
    evidence, and the employee's own explanation before any decision is taken.
    """

    class Violation(models.TextChoices):
        ATTENDANCE_FALSIFICATION = "attendance_falsification", "Attendance falsification"
        CLOCKING_FOR_ANOTHER = "clocking_for_another", "Clocking in for another employee"
        UNAUTHORIZED_DEPARTURE = "unauthorized_departure", "Unauthorized workplace departure"
        REPEATED_LATENESS = "repeated_lateness", "Repeated unexcused lateness"
        HOURS_MISREPRESENTATION = "hours_misrepresentation", "Misrepresentation of working hours"
        REFUSAL_OF_DUTIES = "refusal_of_duties", "Deliberate refusal to perform duties"
        RESOURCE_MISUSE = "resource_misuse", "Misuse of company resources"
        MISCONDUCT = "misconduct", "Serious professional misconduct"
        OTHER = "other", "Other documented violation"

    class Stage(models.TextChoices):
        COACHING = "coaching", "Coaching"
        VERBAL_WARNING = "verbal_warning", "Verbal warning (documented)"
        WRITTEN_WARNING = "written_warning", "Written warning"
        IMPROVEMENT_PLAN = "improvement_plan", "Performance improvement plan"
        FURTHER_ACTION = "further_action", "Further lawful disciplinary action"
        TERMINATION = "termination", "Termination (when legally justified)"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        INVESTIGATING = "investigating", "Investigating"
        AWAITING_RESPONSE = "awaiting_response", "Awaiting employee response"
        ACTION_TAKEN = "action_taken", "Action taken"
        CLOSED = "closed", "Closed"
        DISMISSED = "dismissed", "Dismissed"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="discipline_cases"
    )
    violation = models.CharField(max_length=40, choices=Violation.choices)
    stage = models.CharField(max_length=30, choices=Stage.choices, default=Stage.COACHING)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.OPEN)
    summary = models.CharField(max_length=300)
    evidence = models.TextField(blank=True, default="")

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_discipline_cases",
    )
    opened_at = models.DateTimeField(null=True, blank=True)
    #: The employee's own explanation — always invited before a decision.
    employee_response = models.TextField(blank=True, default="")
    responded_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_discipline_cases",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True, default="")
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="discipline_status_idx"),
            models.Index(fields=["employee", "-created_at"], name="discipline_employee_idx"),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.violation} ({self.stage}/{self.status})"


class PerformanceTask(models.Model):
    """A documented assignment / objective. Attendance alone never determines performance."""

    class Period(models.TextChoices):
        DAILY = "daily", "Daily assignment"
        WEEKLY = "weekly", "Weekly objective"
        MONTHLY = "monthly", "Monthly objective"
        AD_HOC = "ad_hoc", "Ad-hoc task"

    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="performance_tasks"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    period = models.CharField(max_length=20, choices=Period.choices, default=Period.DAILY)
    due_date = models.DateField(null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    #: Reported by the employee; the supervisor's quality score is what counts for review.
    progress = models.PositiveSmallIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    quality_score = models.PositiveSmallIntegerField(null=True, blank=True)

    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_performance_tasks",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_performance_tasks",
    )
    feedback = models.CharField(max_length=300, blank=True, default="")
    feedback_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feedback_performance_tasks",
    )
    feedback_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "due_date"], name="perftask_status_due_idx"),
            models.Index(fields=["employee", "-created_at"], name="perftask_employee_idx"),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.title} ({self.status})"


class PerformanceReview(models.Model):
    """A documented, job-related performance review across the Founder/CEO's criteria."""

    #: The twelve criteria the Founder/CEO specified. Scores are 1-5, entered by a human.
    CRITERIA = (
        "reliability",
        "punctuality",
        "work_quality",
        "productivity",
        "responsibility",
        "communication",
        "teamwork",
        "problem_solving",
        "professional_conduct",
        "learning_progress",
        "initiative",
        "adaptability",
    )

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="performance_reviews"
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    scores = models.JSONField(default=dict, blank=True)
    strengths = models.TextField(blank=True, default="")
    improvements = models.TextField(blank=True, default="")
    development_goals = models.TextField(blank=True, default="")
    notes = models.CharField(max_length=300, blank=True, default="")
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="written_performance_reviews",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end", "-created_at"]
        indexes = [models.Index(fields=["employee", "-period_end"], name="perfreview_employee_idx")]

    def __str__(self):
        return f"{self.employee.employee_number} review {self.period_start}..{self.period_end}"


class TrainingRecord(models.Model):
    """Training & development: onboarding, required, department, technical and development."""

    class Category(models.TextChoices):
        ONBOARDING = "onboarding", "Onboarding"
        REQUIRED = "required", "Required training"
        DEPARTMENT = "department", "Department training"
        TECHNICAL = "technical", "Technical skills development"
        DEVELOPMENT = "development", "Professional development plan"

    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Not passed"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="training_records"
    )
    title = models.CharField(max_length=200)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.REQUIRED
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    due_date = models.DateField(null=True, blank=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    #: 0-100 assessment score, entered by the assessor. Never auto-generated.
    assessment_score = models.PositiveSmallIntegerField(null=True, blank=True)
    learning_progress = models.CharField(max_length=200, blank=True, default="")
    supervisor_feedback = models.CharField(max_length=300, blank=True, default="")
    feedback_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_feedback_given",
    )
    feedback_at = models.DateTimeField(null=True, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_training_records",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "due_date"], name="training_status_due_idx"),
            models.Index(fields=["employee", "-created_at"], name="training_employee_idx"),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.title} ({self.status})"


class Recognition(models.Model):
    """Employee recognition based on documented performance. No automatic financial reward."""

    class Category(models.TextChoices):
        PERFORMANCE = "performance", "Excellent performance"
        TEAMWORK = "teamwork", "Outstanding teamwork"
        RELIABILITY = "reliability", "Reliability"
        INNOVATION = "innovation", "Innovation"
        DEVELOPMENT = "development", "Professional development"
        CUSTOMER_SERVICE = "customer_service", "Customer service"
        CONTRIBUTION = "contribution", "Exceptional contribution"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="recognitions"
    )
    category = models.CharField(
        max_length=30, choices=Category.choices, default=Category.PERFORMANCE
    )
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=300, blank=True, default="")
    #: The documented performance this recognition is based on (never favouritism).
    evidence = models.CharField(max_length=300, blank=True, default="")
    period = models.CharField(max_length=40, blank=True, default="")
    awarded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="awarded_recognitions",
    )
    awarded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-awarded_at", "-created_at"]
        indexes = [models.Index(fields=["employee", "-created_at"], name="recognition_employee_idx")]

    def __str__(self):
        return f"{self.employee.employee_number} {self.category}: {self.title}"


class PolicyAcknowledgment(models.Model):
    """Employee acknowledgment of a specific policy version.

    Deliberately separate from the ID-card signature: a stored card signature is NEVER applied
    to agreements automatically. The acknowledgment records which authenticated user confirmed
    which policy version, and when.
    """

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="policy_acknowledgments"
    )
    policy_key = models.CharField(max_length=60, db_index=True)
    policy_version = models.CharField(max_length=40)
    acknowledged_at = models.DateTimeField()
    #: Authentication context (never a signature, never a password).
    auth_context = models.CharField(max_length=200, blank=True, default="")
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="policy_acknowledgments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-acknowledged_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "policy_key", "policy_version"],
                name="unique_policy_acknowledgment",
            ),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.policy_key} v{self.policy_version}"


# ══════════════════════════════════════════════════════════════════════════════
# Hourly employee verification (Founder/CEO directive)
#
# CEO REQUIREMENT: every verification code is generated AUTOMATICALLY by the Yala backend.
# Neither employees, supervisors nor administrators can create, choose or read a code.
#
# Security properties encoded in this schema:
# * The code is NEVER stored in plaintext — only a salted hash (``code_hash``), so no database
#   read, admin page or log line can reveal it.
# * One challenge per employee per due time (DB constraint), so a refresh, a new tab or a
#   direct API call cannot manufacture extra challenges or bypass the lock.
# * Five-minute expiry, single use, bounded attempts and bounded resends.
# * The stored phone reference keeps only the last 4 digits for display; the full number lives
#   in ``VerifiedPhone`` and is never returned to the frontend.
# ══════════════════════════════════════════════════════════════════════════════


class VerifiedPhone(models.Model):
    """The employee's verified phone number used for hourly verification codes.

    Kept as its own record (rather than on StaffEmployee) so phone PII has one owner, an
    explicit verification state and a full change history. The full number is never exposed
    through an API response — only the last four digits are ever displayed.
    """

    employee = models.OneToOneField(
        StaffEmployee, on_delete=models.CASCADE, related_name="verified_phone"
    )
    #: E.164-style stored number, e.g. +22222114373.
    phone_number = models.CharField(max_length=32)
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_employee_phones",
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Verified employee phone"
        verbose_name_plural = "Verified employee phones"

    @property
    def last4(self) -> str:
        return (self.phone_number or "")[-4:]

    def __str__(self):
        return f"{self.employee.employee_number} phone ****{self.last4}"

class VerificationChallenge(models.Model):
    """One automatic hourly verification challenge for one employee.

    Lifecycle: ``pending`` → ``verified`` | ``expired`` | ``missed`` | ``recovery_required``.
    The plaintext code is never stored; ``code_hash`` is a salted hash produced with Django's
    password hasher and compared in constant time.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        EXPIRED = "expired", "Expired"
        MISSED = "missed", "Missed verification"
        RECOVERY_REQUIRED = "recovery_required", "Recovery required"
        EXEMPT = "exempt", "Exempt - authorized break"

    class SmsStatus(models.TextChoices):
        QUEUED = "queued", "Queued"
        MOCK_SENT = "mock_sent", "Mock sent (local development)"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="verification_challenges"
    )
    attendance_record = models.ForeignKey(
        AttendanceRecord,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="verification_challenges",
    )
    #: When this verification was due (the 60-minute mark of scheduled working time).
    due_at = models.DateTimeField(db_index=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    #: Salted hash of the six-digit code. The plaintext code is never persisted.
    code_hash = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    resend_count = models.PositiveSmallIntegerField(default=0)
    max_resends = models.PositiveSmallIntegerField(default=3)

    sms_status = models.CharField(
        max_length=20, choices=SmsStatus.choices, default=SmsStatus.QUEUED
    )
    #: Provider reference only — never the code, never the full phone number.
    sms_reference = models.CharField(max_length=120, blank=True, default="")
    phone_last4 = models.CharField(max_length=4, blank=True, default="")

    recovery_requested_at = models.DateTimeField(null=True, blank=True)
    recovery_note = models.CharField(max_length=300, blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_verification_challenges",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-due_at"]
        constraints = [
            # One challenge per employee per due time: refreshing the page, opening a new tab
            # or calling the API directly cannot create extra challenges.
            models.UniqueConstraint(
                fields=["employee", "due_at"], name="unique_employee_verification_due"
            ),
        ]
        indexes = [
            models.Index(fields=["status", "due_at"], name="verify_status_due_idx"),
            models.Index(fields=["employee", "-due_at"], name="verify_employee_due_idx"),
        ]

    def __str__(self):
        return (
            f"{self.employee.employee_number} verify "
            f"{self.due_at:%Y-%m-%d %H:%M} ({self.status})"
        )

    @property
    def is_open(self) -> bool:
        """True while the challenge can still be answered."""
        return self.status == self.Status.PENDING

    @property
    def attempts_remaining(self) -> int:
        return max(0, self.max_attempts - self.attempts)


# ══════════════════════════════════════════════════════════════════════════════
# Automatic break notifications (Founder/CEO requirement)
#
# Breakfast: 09:55 reminder · 10:00 start · 10:25 return reminder · 10:30 end
# Lunch:     12:55 reminder · 13:00 start · 13:55 return reminder · 14:00 end
#
# Design notes:
# * One row per employee + notification kind + due time (DB constraint), so a page refresh, a
#   second browser tab or a repeated sweep can never produce a duplicate notification.
# * The row records the message that was actually shown and whether it was acknowledged. It
#   never writes break start/end times: actual break times come only from the employee's own
#   Start/End break actions, so a notification can never falsify a break record.
# * Break windows come from the employee's policy (and their assigned shift, when an authorized
#   exception applies) and the times are rendered in the EMPLOYEE's own timezone.
# ══════════════════════════════════════════════════════════════════════════════


class BreakNotification(models.Model):
    """One automatic break notification delivered to one employee."""

    class Kind(models.TextChoices):
        BREAKFAST_REMINDER = "breakfast_reminder", "Breakfast in five minutes"
        BREAKFAST_START = "breakfast_start", "Breakfast begins"
        BREAKFAST_RETURN = "breakfast_return", "Breakfast ends in five minutes"
        BREAKFAST_END = "breakfast_end", "Breakfast ends"
        LUNCH_REMINDER = "lunch_reminder", "Lunch in five minutes"
        LUNCH_START = "lunch_start", "Lunch begins"
        LUNCH_RETURN = "lunch_return", "Lunch ends in five minutes"
        LUNCH_END = "lunch_end", "Lunch ends"
        # Clock-out reminders (Founder/CEO policy: 16:55 warning, 17:00 end, 17:05 deadline).
        # These were previously computed by ``attendance_service.clock_out_reminders()`` but had
        # no kind to be stored under, so they were never dispatched automatically.
        CLOCK_OUT_REMINDER = "clock_out_reminder", "Workday ends in five minutes"
        CLOCK_OUT_DUE = "clock_out_due", "Scheduled workday has ended"
        CLOCK_OUT_DEADLINE = "clock_out_deadline", "Clock-out deadline passed"

    class Channel(models.TextChoices):
        PORTAL = "portal", "Employee portal"
        PUSH = "push", "Mobile push"
        PORTAL_AND_PUSH = "portal_and_push", "Portal and mobile push"

    employee = models.ForeignKey(
        StaffEmployee, on_delete=models.CASCADE, related_name="break_notifications"
    )
    attendance_record = models.ForeignKey(
        AttendanceRecord,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="break_notifications",
    )
    kind = models.CharField(max_length=30, choices=Kind.choices, db_index=True)
    #: Due time in UTC; rendered in the employee's own timezone for display.
    due_at = models.DateTimeField(db_index=True)
    message = models.CharField(max_length=200)
    #: Whether a sound should be played, subject to the device's own settings.
    sound = models.BooleanField(default=True)
    channel = models.CharField(
        max_length=20, choices=Channel.choices, default=Channel.PORTAL
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-due_at"]
        constraints = [
            # Duplicate-notification guard: one notification per employee, kind and due time.
            models.UniqueConstraint(
                fields=["employee", "kind", "due_at"], name="unique_employee_break_notification"
            ),
        ]
        indexes = [
            models.Index(fields=["employee", "-due_at"], name="breaknote_employee_idx"),
            models.Index(fields=["due_at"], name="breaknote_due_idx"),
        ]

    def __str__(self):
        return f"{self.employee.employee_number} {self.kind} @ {self.due_at:%Y-%m-%d %H:%M}"

