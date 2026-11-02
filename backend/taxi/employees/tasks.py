"""Celery tasks for the employees app (Phase 4 scheduler).

Every task is **idempotent** — safe to retry or run repeatedly without producing duplicate
side effects — and delegates to the existing service layer, so there is no duplicated business
logic. They are registered with Celery Beat through ``CELERY_BEAT_SCHEDULE`` in settings and use
the project timezone (``Africa/Nouakchott``).

Security/privacy invariants preserved:
  * verification codes are generated server-side, stored hashed, and never logged;
  * SMS delivery stays on the mock provider (no real message is sent);
  * notifications never create or modify an attendance record and never clock anyone out;
  * authorized breaks, approved leave and departure exemptions are honoured by the service layer.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="employees.tasks.issue_hourly_verification_task")
def issue_hourly_verification_task() -> dict:
    """Issue hourly verification challenges that have come due and expire stale ones.

    Runs every minute. The service layer enforces the 60-minute scheduled-work rule, the
    authorized-break / approved-leave / departure exemptions, and duplicate prevention (one
    active challenge per employee), so a repeated run cannot double-issue a code.

    Returns a dict of counts for logging and evidence.
    """
    from employees.services import verification_service as verification

    issued = verification.schedule_due_challenges()
    missed = verification.expire_due_challenges()
    logger.info(
        "issue_hourly_verification_task: %s issued, %s expired/missed.", issued, missed
    )
    return {"issued": issued, "missed": missed}


@shared_task(name="employees.tasks.dispatch_break_notifications_task")
def dispatch_break_notifications_task() -> dict:
    """Dispatch the scheduled break and clock-out notifications that are now due.

    Runs every minute. The service layer honours the approved schedule (breakfast 09:55/10:00/
    10:25/10:30, lunch 12:55/13:00/13:55/14:00, clock-out 16:55/17:00/17:05), the employee's
    working schedule and the authorized-shift exceptions, and prevents duplicates through a
    database uniqueness constraint — so re-running is safe.

    Clock-out reminders are dispatched here too. They were previously only computed on demand by
    the API and never scheduled, so they are now persisted like the break notifications.

    Notifications never create or modify an actual break record and never clock anyone out.
    """
    from employees.services import break_notification_service

    created = break_notification_service.dispatch_break_notifications()
    clock_out_created = break_notification_service.dispatch_clock_out_notifications()
    logger.info(
        "dispatch_break_notifications_task: %s break + %s clock-out notification(s) created.",
        created,
        clock_out_created,
    )
    return {"created": created, "clock_out_created": clock_out_created}



@shared_task(name="employees.tasks.employee_scheduler_tick")
def employee_scheduler_tick() -> dict:
    """Run the full employee scheduler tick: verification sweep + break dispatch.

    This is the single entry point Beat schedules every minute. It is deliberately the only
    place that sequences the two sweeps, so the ordering is defined once.
    """
    verification_result = issue_hourly_verification_task()
    break_result = dispatch_break_notifications_task()
    attendance_result = attendance_sweep_task()
    return {
        "verification": verification_result,
        "break_notifications": break_result,
        "attendance": attendance_result,
    }


@shared_task(name="employees.tasks.attendance_sweep_task")
def attendance_sweep_task() -> dict:
    """Flag open attendance past its (shift-aware) clock-out deadline and missed clock-outs.

    Task 10. Runs inside the existing per-minute ``employee_scheduler_tick`` — no new Beat
    entry. Only idempotent flag updates on attendance rows; it sends no notification (clock-out
    reminders are dispatched and de-duplicated by break_notification_service), never invents a
    clock-out time and never changes worked hours.
    """
    from employees.services import attendance_service

    result = attendance_service.attendance_sweep()
    logger.info("attendance_sweep_task: %s", result)
    return result
