"""Automatic hourly employee verification (Founder/CEO directive).

CEO REQUIREMENT: **every verification code is generated automatically by the Yala backend.**
Neither employees, supervisors nor administrators can create, choose or read a code.

Design guarantees
=================
* ``generate_code()`` uses ``secrets`` (CSPRNG) — the only place a code is ever produced.
* The code is stored **only** as a salted hash (Django's password hasher) and compared in
  constant time. It is never written to a log, an API response or a model field in plaintext.
* One challenge per employee per due time, enforced by a database constraint, so a page
  refresh, a new browser tab or a direct API call cannot manufacture extra challenges or skip
  the lock.
* Five-minute expiry, single use, bounded attempts and bounded resends.
* Verification pauses during scheduled breaks, approved leave and approved temporary
  departures, and supports alternative schedules through the existing work-schedule/policy.
* **Local development uses a MOCK SMS provider.** Real SMS delivery is NOT activated and
  requires explicit Founder/CEO authorization.
* A missed verification is recorded for review — it is never treated as proof that the
  employee was absent, and it never triggers an automatic penalty.
"""

from __future__ import annotations

import secrets
from datetime import datetime, time, timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from ..models import (
    AttendancePolicy,
    AttendanceRecord,
    ExitPermissionRequest,
    StaffEmployee,
    VerificationChallenge,
    VerifiedPhone,
)
from . import attendance_service as attendance

#: A verification code is always six digits.
CODE_LENGTH = 6
#: Codes expire after five minutes.
CODE_TTL_SECONDS = 300
#: Verification is due every 60 minutes of scheduled working time.
VERIFICATION_INTERVAL_MINUTES = 60
#: Attempts and resends are both bounded (brute-force and SMS-abuse protection).
MAX_ATTEMPTS = 5
MAX_RESENDS = 3
RESEND_COOLDOWN_SECONDS = 60
#: After this long with no answer a pending challenge becomes a missed verification.
MISSED_AFTER_MINUTES = 5


class VerificationError(Exception):
    """A rule violation. ``code`` is a stable machine-readable identifier."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ── SMS delivery (mock during local development) ─────────────────────────────

#: Provider names that record delivery locally and never transmit a message. ``mock`` is this
#: module's own name; ``console`` (and the common test sinks) are the project-wide local
#: development convention used by ``authapp`` and ``notifications.sms_fallback``. Treating them
#: as equivalents keeps the local verification flow working without changing global settings.
LOCAL_NO_SEND_PROVIDERS = {"mock", "console", "locmem", "dummy"}


def sms_provider_name() -> str:
    return str(getattr(settings, "YALA_SMS_PROVIDER", "mock")).lower()


def send_verification_sms(phone_number, code, *, employee_number=""):
    """Deliver a verification code. Returns ``(sms_status, provider_reference)``.

    Local development uses a **no-send** provider: nothing leaves the server, the delivery is
    recorded as ``mock_sent``, and the code is never logged. A real provider adapter is
    deliberately not implemented — activating real SMS delivery requires Founder/CEO
    authorization.
    """
    if sms_provider_name() not in LOCAL_NO_SEND_PROVIDERS:
        return VerificationChallenge.SmsStatus.FAILED, "provider_not_configured"
    return VerificationChallenge.SmsStatus.MOCK_SENT, f"mock-{secrets.token_hex(6)}"


def verification_sms_text(code) -> str:
    """The approved SMS wording (contains the code — used only for the outbound message)."""
    return (
        f"Yala Technologies: Your employee verification code is {code}. "
        f"This code expires in five minutes. Do not share this code."
    )


# ── Code generation and comparison (backend only) ────────────────────────────

def generate_code() -> str:
    """A cryptographically secure six-digit code. The ONLY place a code is produced."""
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def hash_code(code) -> str:
    """Salted one-way hash of a code — the only representation ever stored."""
    return make_password(str(code))


def code_matches(code, code_hash) -> bool:
    """Constant-time comparison against the stored hash."""
    if not code_hash:
        return False
    return check_password(str(code), code_hash)


def looks_like_code(value) -> bool:
    text = str(value or "").strip()
    return len(text) == CODE_LENGTH and text.isdigit()



# ── Exemptions and scheduling ────────────────────────────────────────────────

def exemption_for(employee, record=None, now=None):
    """Why verification is paused right now, or ``None``.

    Verification pauses during the scheduled breakfast/lunch break, approved leave and an
    approved temporary departure from the office.
    """
    policy = (record.policy if record else None) or attendance.get_policy(
        getattr(employee, "office_city", None) or attendance.DEFAULT_CITY
    )
    moment = now or timezone.now()
    day = attendance.local_day(now=moment, policy=policy)

    if attendance.approved_leave_for(employee, day) is not None:
        return "approved_leave"

    exit_request = ExitPermissionRequest.objects.filter(
        employee=employee,
        date=day,
        status__in=[
            ExitPermissionRequest.Status.APPROVED,
            ExitPermissionRequest.Status.COMPLETED,
        ],
    ).first()
    if exit_request is not None:
        local_time = attendance.local_now(now=moment, policy=policy).time()
        if exit_request.actual_departure and not exit_request.actual_return:
            return "authorized_departure"
        if exit_request.requested_departure <= local_time <= exit_request.expected_return:
            return "authorized_departure"

    if record is not None:
        # An open scheduled break (breakfast or lunch) pauses verification.
        if record.breaks.filter(ended_at__isnull=True).exists():
            return "authorized_break"
    return None


def _next_due(record, policy, now):
    """The next 60-minute verification mark for this open attendance record."""
    last = (
        VerificationChallenge.objects.filter(employee=record.employee)
        .order_by("-due_at")
        .values_list("due_at", flat=True)
        .first()
    )
    base = last or record.clock_in
    if base is None:
        return None
    due = base + timedelta(minutes=VERIFICATION_INTERVAL_MINUTES)
    # Never schedule a due time more than one interval in the past, so a long outage cannot
    # create a burst of back-dated challenges.
    floor = now - timedelta(minutes=VERIFICATION_INTERVAL_MINUTES)
    return due if due > floor else floor


def _issue(employee, record, due_at, now):
    """Create (or reuse) the challenge for ``due_at`` and deliver a fresh code."""
    challenge, created = VerificationChallenge.objects.get_or_create(
        employee=employee,
        due_at=due_at,
        defaults={
            "attendance_record": record,
            "max_attempts": MAX_ATTEMPTS,
            "max_resends": MAX_RESENDS,
        },
    )
    if not created and challenge.status != VerificationChallenge.Status.PENDING:
        return challenge, False

    code = generate_code()
    challenge.attendance_record = record
    challenge.generated_at = now
    challenge.expires_at = now + timedelta(seconds=CODE_TTL_SECONDS)
    challenge.code_hash = hash_code(code)
    challenge.status = VerificationChallenge.Status.PENDING

    phone = VerifiedPhone.objects.filter(employee=employee, is_verified=True).first()
    if phone is None:
        # No verified phone: the challenge still exists (and locks), but nothing is sent.
        challenge.sms_status = VerificationChallenge.SmsStatus.FAILED
        challenge.sms_reference = "no_verified_phone"
        challenge.phone_last4 = ""
    else:
        status_value, reference = send_verification_sms(
            phone.phone_number, code, employee_number=employee.employee_number
        )
        challenge.sms_status = status_value
        challenge.sms_reference = reference
        challenge.phone_last4 = phone.last4
    challenge.save()
    return challenge, True


def schedule_due_challenges(now=None) -> int:
    """Create and deliver the challenge for every employee who is now due.

    Runs automatically on the backend — no supervisor action is required to initiate an hourly
    verification. Returns the number of challenges issued.
    """
    moment = now or timezone.now()
    issued = 0
    open_records = AttendanceRecord.objects.filter(
        clock_in__isnull=False, clock_out__isnull=True
    ).select_related("employee", "policy")
    for record in open_records:
        if exemption_for(record.employee, record=record, now=moment) is not None:
            continue
        policy = record.policy or attendance.get_policy(record.city)
        due = _next_due(record, policy, moment)
        if due is None or due > moment:
            continue
        _, created = _issue(record.employee, record, due, moment)
        if created:
            issued += 1
    return issued


def expire_due_challenges(now=None) -> int:
    """Mark pending challenges past their five-minute window as missed verifications.

    A missed verification keeps the session locked and is recorded for supervisor/HR review. It
    is NOT proof of absence and carries no automatic penalty.
    """
    moment = now or timezone.now()
    stale = VerificationChallenge.objects.filter(
        status=VerificationChallenge.Status.PENDING, expires_at__lt=moment
    )
    count = stale.count()
    if count:
        stale.update(status=VerificationChallenge.Status.MISSED, updated_at=moment)
    return count


# ── Verification submission, resend and recovery ─────────────────────────────

def current_challenge(employee, now=None):
    """The challenge the employee must answer now, or the latest missed/recovery one."""
    moment = now or timezone.now()
    pending = (
        VerificationChallenge.objects.filter(
            employee=employee,
            status=VerificationChallenge.Status.PENDING,
            expires_at__gte=moment,
        )
        .order_by("-due_at")
        .first()
    )
    if pending is not None:
        return pending
    return (
        VerificationChallenge.objects.filter(
            employee=employee,
            status__in=[
                VerificationChallenge.Status.MISSED,
                VerificationChallenge.Status.EXPIRED,
                VerificationChallenge.Status.RECOVERY_REQUIRED,
            ],
        )
        .order_by("-due_at")
        .first()
    )


def session_status(employee, now=None):
    """The lock state the employee portal must honour.

    Returns a payload with **no code** — the frontend can never read a verification code.
    """
    moment = now or timezone.now()
    challenge = current_challenge(employee, now=moment)
    exemption = exemption_for(employee, record=attendance.open_record(employee), now=moment)

    if exemption is not None:
        return {
            "locked": False,
            "status": "exempt",
            "exemption": exemption,
            "message": "Verification is paused for an authorized reason.",
            "challenge": None,
        }
    if challenge is None:
        return {
            "locked": False,
            "status": "verified",
            "exemption": None,
            "message": "No verification is due.",
            "challenge": None,
        }

    locked = challenge.status != VerificationChallenge.Status.VERIFIED
    return {
        "locked": locked,
        "status": challenge.status,
        "exemption": None,
        "message": (
            "A six-digit verification code has been sent to your registered phone number. "
            "Please enter the code to confirm your availability and continue working."
        ),
        "challenge": {
            "id": challenge.id,
            "due_at": challenge.due_at,
            "expires_at": challenge.expires_at,
            "status": challenge.status,
            "attempts_remaining": challenge.attempts_remaining,
            "resends_remaining": max(0, challenge.max_resends - challenge.resend_count),
            "phone_last4": challenge.phone_last4,
            "sms_status": challenge.sms_status,
        },
    }


def submit_code(employee, code, now=None):
    """Validate a submitted code. Single use, five-minute expiry, bounded attempts."""
    moment = now or timezone.now()
    if not looks_like_code(code):
        raise VerificationError("invalid_format", "Enter the six-digit verification code.")

    challenge = (
        VerificationChallenge.objects.filter(
            employee=employee, status=VerificationChallenge.Status.PENDING
        )
        .order_by("-due_at")
        .first()
    )
    if challenge is None:
        raise VerificationError("no_pending_challenge", "There is no verification pending.")

    if challenge.expires_at and challenge.expires_at < moment:
        challenge.status = VerificationChallenge.Status.MISSED
        challenge.save(update_fields=["status", "updated_at"])
        raise VerificationError(
            "code_expired", "That code has expired. Request a new verification code."
        )

    if challenge.attempts >= challenge.max_attempts:
        raise VerificationError(
            "too_many_attempts",
            "Too many incorrect attempts. Contact your supervisor or request recovery.",
        )

    if not code_matches(code, challenge.code_hash):
        challenge.attempts += 1
        challenge.save(update_fields=["attempts", "updated_at"])
        raise VerificationError("incorrect_code", "That verification code is not correct.")

    # Success: single use — the challenge is closed and the stored code is invalidated.
    challenge.status = VerificationChallenge.Status.VERIFIED
    challenge.verified_at = moment
    challenge.code_hash = ""
    challenge.save(update_fields=["status", "verified_at", "code_hash", "updated_at"])
    return challenge


def resend_code(employee, now=None):
    """Issue a fresh code for the current challenge, within the resend limit and cooldown."""
    moment = now or timezone.now()
    challenge = (
        VerificationChallenge.objects.filter(
            employee=employee, status=VerificationChallenge.Status.PENDING
        )
        .order_by("-due_at")
        .first()
    )
    if challenge is None:
        raise VerificationError("no_pending_challenge", "There is no verification pending.")
    if challenge.resend_count >= challenge.max_resends:
        raise VerificationError(
            "resend_limit_reached", "The resend limit has been reached for this verification."
        )
    if (
        challenge.generated_at
        and (moment - challenge.generated_at).total_seconds() < RESEND_COOLDOWN_SECONDS
    ):
        raise VerificationError("resend_too_soon", "Please wait before requesting another code.")

    code = generate_code()
    challenge.code_hash = hash_code(code)
    challenge.generated_at = moment
    challenge.expires_at = moment + timedelta(seconds=CODE_TTL_SECONDS)
    challenge.resend_count += 1
    challenge.attempts = 0

    phone = VerifiedPhone.objects.filter(employee=employee, is_verified=True).first()
    if phone is None:
        challenge.sms_status = VerificationChallenge.SmsStatus.FAILED
        challenge.sms_reference = "no_verified_phone"
    else:
        status_value, reference = send_verification_sms(
            phone.phone_number, code, employee_number=employee.employee_number
        )
        challenge.sms_status = status_value
        challenge.sms_reference = reference
        challenge.phone_last4 = phone.last4
    challenge.save()
    return challenge


def request_recovery(employee, note="", now=None):
    """Escalate to a supervisor: the secure recovery path when a code cannot be received."""
    moment = now or timezone.now()
    challenge = current_challenge(employee, now=moment)
    if challenge is None:
        raise VerificationError("no_challenge", "There is no verification to recover.")
    challenge.status = VerificationChallenge.Status.RECOVERY_REQUIRED
    challenge.recovery_requested_at = moment
    challenge.recovery_note = str(note or "")[:300]
    challenge.save(
        update_fields=["status", "recovery_requested_at", "recovery_note", "updated_at"]
    )
    return challenge


def resolve_recovery(challenge, *, reviewed_by, note=""):
    """Supervisor/HR closes a recovery: verification is cleared and the session unlocks."""
    challenge.status = VerificationChallenge.Status.VERIFIED
    challenge.verified_at = timezone.now()
    challenge.reviewed_by = reviewed_by
    challenge.reviewed_at = timezone.now()
    challenge.review_note = str(note or "")[:300]
    challenge.code_hash = ""
    challenge.save(
        update_fields=[
            "status",
            "verified_at",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "code_hash",
            "updated_at",
        ]
    )
    return challenge


# ── Supervisor monitoring and CEO overview ───────────────────────────────────

def monitoring_rows(day=None, *, department=None, city=None, now=None):
    """Live verification monitoring rows (supervisor dashboard). Never exposes codes."""
    moment = now or timezone.now()
    policy = attendance.get_policy(city or attendance.DEFAULT_CITY)
    day = day or attendance.local_day(now=moment, policy=policy)

    records = attendance.AttendanceRecord.objects.filter(work_date=day).select_related(
        "employee", "policy"
    )
    if city:
        records = records.filter(city=city)
    if department:
        records = records.filter(employee__department=department)

    rows = []
    for record in records:
        employee = record.employee
        challenge = current_challenge(employee, now=moment)
        exemption = exemption_for(employee, record=record, now=moment)
        missed = VerificationChallenge.objects.filter(
            employee=employee,
            due_at__date=day,
            status=VerificationChallenge.Status.MISSED,
        ).count()
        last_verified = (
            VerificationChallenge.objects.filter(
                employee=employee, status=VerificationChallenge.Status.VERIFIED
            )
            .order_by("-verified_at")
            .values_list("verified_at", flat=True)
            .first()
        )
        if exemption is not None:
            status_value = "exempt"
        elif challenge is None:
            status_value = "verified"
        else:
            status_value = challenge.status

        rows.append(
            {
                "employee_number": employee.employee_number,
                "employee_name": employee.full_name,
                "department": employee.department or "",
                "work_location": record.work_location or employee.office_city,
                "work_mode": record.work_mode,
                "remote": record.work_mode != AttendancePolicy.WorkMode.OFFICE,
                "clock_in": record.clock_in,
                "last_verified_at": last_verified,
                "next_due_at": challenge.due_at if challenge else None,
                "status": status_value,
                "exemption": exemption,
                "missed_count": missed,
                "attendance_status": record.status,
                "phone_last4": challenge.phone_last4 if challenge else "",
            }
        )
    return rows


def ceo_overview(day=None, now=None):
    """CEO Command Center verification figures (real records only)."""
    moment = now or timezone.now()
    rows = monitoring_rows(day=day, now=moment)

    cities = {}
    for city in attendance.ATTENDANCE_CITIES:
        city_rows = monitoring_rows(day=day, city=city, now=moment)
        cities[city] = {
            "working": len(city_rows),
            "verified": sum(1 for row in city_rows if row["status"] == "verified"),
            "pending": sum(1 for row in city_rows if row["status"] == "pending"),
            "missed": sum(1 for row in city_rows if row["status"] == "missed"),
            "on_break": sum(1 for row in city_rows if row["exemption"] == "authorized_break"),
        }

    departments = {}
    for row in rows:
        key = row["department"] or "Unassigned"
        bucket = departments.setdefault(
            key, {"department": key, "working": 0, "verified": 0, "missed": 0, "pending": 0}
        )
        bucket["working"] += 1
        if row["status"] in bucket:
            bucket[row["status"]] += 1

    return {
        "total_working": len(rows),
        "onsite": sum(1 for row in rows if not row["remote"]),
        "remote": sum(1 for row in rows if row["remote"]),
        "verified": sum(1 for row in rows if row["status"] == "verified"),
        "awaiting_verification": sum(1 for row in rows if row["status"] == "pending"),
        "missed_verifications": sum(1 for row in rows if row["status"] == "missed"),
        "on_authorized_break": sum(
            1 for row in rows if row["exemption"] == "authorized_break"
        ),
        "requiring_supervisor_review": sum(
            1 for row in rows if row["status"] in {"missed", "recovery_required"}
        ),
        "cities": cities,
        "departments": sorted(departments.values(), key=lambda item: item["department"]),
    }
