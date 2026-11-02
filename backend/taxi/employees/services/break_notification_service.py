"""Automatic break notifications (Founder/CEO requirement).

Breakfast: 09:55 reminder · 10:00 start · 10:25 return reminder · 10:30 end
Lunch:     12:55 reminder · 13:00 start · 13:55 return reminder · 14:00 end

Guarantees
==========
* **Automatic.** ``dispatch_break_notifications()`` creates every due notification on the
  backend; no employee or supervisor action initiates it.
* **No duplicates.** Each notification is keyed by (employee, kind, due time) with a database
  constraint, so a page refresh, a second tab or a repeated sweep cannot repeat one.
* **Never falsifies break records.** Notifications only carry a message and a sound flag. Break
  start/end times are written exclusively by the employee's own Start/End break actions.
* **Employee schedule and timezone respected.** Windows come from the employee's policy (or
  their authorized shift exception) and each notification is rendered in the employee's own
  timezone as well as the company timezone.
* **Sound is advisory.** ``sound=True`` asks the portal to play a notification tone when the
  device permits it; the backend never assumes audio is available.
* **Mobile push is prepared, not activated.** ``channel`` records what the portal should do;
  real push delivery requires a provider and CEO authorization, so nothing is sent externally.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.utils import timezone

from ..models import AttendanceRecord, BreakNotification, StaffEmployee
from . import attendance_service as attendance

#: The eight notifications, expressed as offsets in minutes from the break start/end.
#: ``(kind, break_type, anchor, offset_minutes)`` where anchor is "start" or "end".
BREAK_SCHEDULE = (
    ("breakfast_reminder", "breakfast", "start", -5),
    ("breakfast_start", "breakfast", "start", 0),
    ("breakfast_return", "breakfast", "end", -5),
    ("breakfast_end", "breakfast", "end", 0),
    ("lunch_reminder", "lunch", "start", -5),
    ("lunch_start", "lunch", "start", 0),
    ("lunch_return", "lunch", "end", -5),
    ("lunch_end", "lunch", "end", 0),
)

MESSAGES = {
    "breakfast_reminder": (
        "Breakfast break starts in 5 minutes ({start}). Please prepare to pause work."
    ),
    "breakfast_start": (
        "Breakfast break has started ({start}-{end}). Please record your break."
    ),
    "breakfast_return": "Breakfast break ends in 5 minutes ({end}). Please return to work.",
    "breakfast_end": (
        "Breakfast break has ended. Please resume work and record your return."
    ),
    "lunch_reminder": (
        "Lunch break starts in 5 minutes ({start}). Please prepare to pause work."
    ),
    "lunch_start": "Lunch break has started ({start}-{end}). Please record your break.",
    "lunch_return": "Lunch break ends in 5 minutes ({end}). Please return to work.",
    "lunch_end": "Lunch break has ended. Please resume work and record your return.",
}


def _windows(policy, shift=None):
    """Break windows as local wall-clock times.

    An authorized shift exception (a scheduled shift whose start differs from the policy's)
    shifts the break windows by the same offset, so an approved alternative schedule is honoured
    without editing the company policy.
    """
    offset = timedelta(0)
    if shift is not None and policy.shift_start:
        policy_start = datetime.combine(timezone.localdate(), policy.shift_start)
        shift_start = datetime.combine(timezone.localdate(), shift.start_time)
        offset = shift_start - policy_start

    def _shift_time(value):
        return (datetime.combine(timezone.localdate(), value) + offset).time()

    return {
        "breakfast_start": _shift_time(policy.breakfast_start),
        "breakfast_end": _shift_time(policy.breakfast_end),
        "lunch_start": _shift_time(policy.lunch_start),
        "lunch_end": _shift_time(policy.lunch_end),
    }


def due_notifications(employee, *, record=None, now=None):
    """The notifications due for this employee at ``now`` (UTC instants).

    Returns the kind, the UTC due time, the message, the sound flag, and the same instant
    rendered in the employee's own timezone and in the company timezone.
    """
    moment = now or timezone.now()
    policy = (record.policy if record else None) or attendance.get_policy(
        getattr(employee, "office_city", None) or attendance.DEFAULT_CITY
    )
    shift = record.shift if record else None
    windows = _windows(policy, shift=shift)
    day = attendance.local_day(now=moment, policy=policy)
    employee_tz = attendance.employee_timezone(employee)

    due = []
    for kind, break_type, anchor, offset in BREAK_SCHEDULE:
        base = windows[f"{break_type}_{anchor}"]
        wall_clock = (datetime.combine(day, base) + timedelta(minutes=offset)).time()
        due_at = attendance._local_to_utc(day, wall_clock, policy)
        due.append(
            {
                "kind": kind,
                "break_type": break_type,
                "due_at": due_at,
                "due_at_local": due_at.astimezone(employee_tz),
                "due_at_company": due_at.astimezone(attendance.policy_timezone(policy)),
                "message": MESSAGES[kind].format(
                    start=windows[f"{break_type}_start"].strftime("%H:%M"),
                    end=windows[f"{break_type}_end"].strftime("%H:%M"),
                )[:200],
                "sound": True,
            }
        )
    return due


def dispatch_break_notifications(now=None, window_minutes=5):
    """Create every notification that is due within ``window_minutes``. Returns the count.

    Runs automatically on the backend. The unique constraint makes this idempotent, so calling
    it repeatedly (or from two processes) can never duplicate a notification.
    """
    moment = now or timezone.now()
    created = 0
    open_records = attendance.AttendanceRecord.objects.filter(
        clock_in__isnull=False, clock_out__isnull=True
    ).select_related("employee", "policy", "shift")
    for record in open_records:
        for item in due_notifications(record.employee, record=record, now=moment):
            if not (moment <= item["due_at"] <= moment + timedelta(minutes=window_minutes)):
                continue
            _, was_created = BreakNotification.objects.get_or_create(
                employee=record.employee,
                kind=item["kind"],
                due_at=item["due_at"],
                defaults={
                    "attendance_record": record,
                    "message": item["message"],
                    "sound": item["sound"],
                    "channel": BreakNotification.Channel.PORTAL,
                },
            )
            if was_created:
                created += 1
    return created


def dispatch_clock_out_notifications(now=None):
    """Create the scheduled clock-out notifications (16:55 / 17:00 / 17:05) that are now due.

    ``attendance_service.clock_out_reminders()`` already computed these, but nothing dispatched
    them: they had no ``BreakNotification.Kind`` to be stored under and no task called them, so
    the reminders only existed if a client happened to poll the API at exactly the right minute.

    They are now persisted like the break notifications, which gives them the same guarantees —
    automatic, de-duplicated by the (employee, kind, due_at) unique constraint, and delivered
    through the employee portal. Nothing here clocks anyone out or touches a break record.
    """
    from . import attendance_service as attendance

    moment = now or timezone.now()
    created = 0
    for item in attendance.clock_out_reminders(now=moment):
        employee = StaffEmployee.objects.filter(
            employee_number=item["employee_number"]
        ).first()
        if employee is None:
            continue
        due_at = item["due_at"]
        if timezone.is_naive(due_at):
            due_at = timezone.make_aware(due_at, timezone.get_current_timezone())
        record = AttendanceRecord.objects.filter(
            employee=employee, clock_in__isnull=False, clock_out__isnull=True
        ).first()
        _, was_created = BreakNotification.objects.get_or_create(
            employee=employee,
            kind=item["kind"],
            due_at=due_at,
            defaults={
                "attendance_record": record,
                "message": item["message"][:200],
                "sound": True,
                "channel": BreakNotification.Channel.PORTAL,
            },
        )
        if was_created:
            created += 1
    return created



def pending_for_employee(employee, *, now=None):
    """Undelivered notifications for the portal (popup + sound). Marks them delivered.

    Marking as delivered is what makes the popup appear exactly once per notification.
    """
    moment = now or timezone.now()
    rows = BreakNotification.objects.filter(
        employee=employee, delivered_at__isnull=True, due_at__lte=moment
    ).order_by("due_at")[:10]
    payload = []
    for row in rows:
        payload.append(
            {
                "id": row.id,
                "kind": row.kind,
                "message": row.message,
                "sound": row.sound,
                "due_at": row.due_at,
                "due_at_local": row.due_at.astimezone(attendance.employee_timezone(employee)),
                "channel": row.channel,
            }
        )
        row.delivered_at = moment
        row.save(update_fields=["delivered_at"])
    return payload


def acknowledge(notification, *, now=None):
    """Mark a notification as acknowledged by the employee."""
    notification.acknowledged_at = now or timezone.now()
    notification.save(update_fields=["acknowledged_at"])
    return notification


def schedule_preview(employee=None):
    """The notification schedule for the Admin UI (no employee-specific data)."""
    policy = attendance.get_policy(
        getattr(employee, "office_city", None) or attendance.DEFAULT_CITY
    )
    windows = _windows(policy)
    return [
        {
            "kind": kind,
            "break_type": break_type,
            "anchor": anchor,
            "offset_minutes": offset,
            "time": (
                datetime.combine(timezone.localdate(), windows[f"{break_type}_{anchor}"])
                + timedelta(minutes=offset)
            ).strftime("%H:%M"),
            "message": MESSAGES[kind].format(
                start=windows[f"{break_type}_start"].strftime("%H:%M"),
                end=windows[f"{break_type}_end"].strftime("%H:%M"),
            ),
        }
        for kind, break_type, anchor, offset in BREAK_SCHEDULE
    ]


def break_status_rows(day=None, *, city=None, department=None, now=None):
    """Supervisor break status: who is on a break, who is overdue, next notification."""
    moment = now or timezone.now()
    policy = attendance.get_policy(city or attendance.DEFAULT_CITY)
    day = day or attendance.local_day(now=moment, policy=policy)

    records = attendance.AttendanceRecord.objects.filter(work_date=day).select_related(
        "employee", "policy", "shift"
    )
    if city:
        records = records.filter(city=city)
    if department:
        records = records.filter(employee__department=department)

    rows = []
    for record in records:
        open_break = (
            record.breaks.filter(ended_at__isnull=True).order_by("-started_at").first()
        )
        last_break = record.breaks.order_by("-started_at").first()
        windows = _windows(record.policy or policy, shift=record.shift)
        next_notification = (
            BreakNotification.objects.filter(employee=record.employee, due_at__gte=moment)
            .order_by("due_at")
            .first()
        )
        overdue = False
        if open_break is not None:
            expected_end = windows.get(f"{open_break.break_type}_end")
            if expected_end:
                local_now = attendance.local_now(now=moment, policy=record.policy or policy)
                overdue = local_now.time() > expected_end
        rows.append(
            {
                "employee_number": record.employee.employee_number,
                "employee_name": record.employee.full_name,
                "department": record.employee.department or "",
                "work_mode": record.work_mode,
                "on_break": open_break is not None,
                "break_type": open_break.break_type if open_break else "",
                "break_started_at": open_break.started_at if open_break else None,
                "break_overdue": overdue,
                "last_break_type": last_break.break_type if last_break else "",
                "last_break_minutes": last_break.minutes if last_break else 0,
                "next_notification_at": next_notification.due_at if next_notification else None,
                "next_notification_kind": next_notification.kind if next_notification else "",
                "breakfast_window": (
                    f"{windows['breakfast_start']:%H:%M}-{windows['breakfast_end']:%H:%M}"
                ),
                "lunch_window": f"{windows['lunch_start']:%H:%M}-{windows['lunch_end']:%H:%M}",
            }
        )
    return rows
