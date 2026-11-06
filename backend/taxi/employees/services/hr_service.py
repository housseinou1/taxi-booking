"""HR workflow service: exit permission, absence, discipline, performance, development.

Founder/CEO rules encoded here:

* **Nothing is automatic.** No function in this module disciplines, penalises, scores or pays
  anyone on its own. Every state change requires a named human actor, and every decision is
  recorded with who made it and when.
* **Exit permission is mandatory**: an employee who leaves the office during working hours must
  have an approved request; leaving without one can only be *documented* by a supervisor and
  referred to HR — never inferred from a technical failure.
* **Absence notifications never demand medical detail** and always give the employee a
  confirmation that the notification was received.
* **Performance is not attendance.** Tasks and reviews are documented, job-related records
  entered by humans; no productivity metric is fabricated.
* **No payroll.** Nothing here computes wages, deducts pay or awards money.
"""

from __future__ import annotations

from django.utils import timezone

from ..models import (
    AbsenceNotification,
    DisciplineCase,
    ExitPermissionRequest,
    PerformanceReview,
    PerformanceTask,
    PolicyAcknowledgment,
    Recognition,
    TrainingRecord,
)


class HRError(Exception):
    """A rule violation. ``code`` is a stable machine-readable identifier."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _minutes_between(start, end) -> int:
    if not start or not end or end <= start:
        return 0
    return int((end - start).total_seconds() // 60)


# ── Exit permission (mandatory) ──────────────────────────────────────────────

def request_exit(
    employee,
    *,
    day,
    requested_departure,
    expected_return,
    reason,
    requested_by=None,
    supervisor=None,
    is_emergency=False,
):
    """File a permission-to-leave request. Nothing is approved automatically."""
    if not reason or not str(reason).strip():
        raise HRError("reason_required", "A reason is required to request permission to leave.")
    if expected_return < requested_departure:
        raise HRError(
            "invalid_window", "The expected return time must be after the departure time."
        )
    return ExitPermissionRequest.objects.create(
        employee=employee,
        department=employee.department or "",
        date=day,
        requested_departure=requested_departure,
        expected_return=expected_return,
        reason=str(reason).strip()[:300],
        requested_by=requested_by,
        supervisor=supervisor,
        is_emergency=bool(is_emergency),
    )


def decide_exit(exit_request, *, decided_by, approve, note=""):
    """Supervisor/HR decision on an exit request."""
    if exit_request.status not in {
        ExitPermissionRequest.Status.PENDING,
        ExitPermissionRequest.Status.APPROVED,
    }:
        raise HRError("already_decided", "This exit request has already been decided.")
    exit_request.status = (
        ExitPermissionRequest.Status.APPROVED
        if approve
        else ExitPermissionRequest.Status.REJECTED
    )
    exit_request.decided_by = decided_by
    exit_request.decided_at = timezone.now()
    exit_request.decision_note = str(note or "")[:300]
    exit_request.save(
        update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"]
    )
    return exit_request


def record_departure(exit_request, *, now=None):
    """Employee records LEAVE OFFICE. Refused unless the request is approved."""
    if exit_request.status != ExitPermissionRequest.Status.APPROVED:
        raise HRError(
            "not_approved",
            "Leaving the office requires an approved permission request.",
        )
    exit_request.actual_departure = now or timezone.now()
    exit_request.save(update_fields=["actual_departure", "updated_at"])
    return exit_request


def record_return(exit_request, *, now=None):
    """Employee records RETURN TO OFFICE and the time away is computed."""
    if not exit_request.actual_departure:
        raise HRError("no_departure", "Record leaving the office before recording a return.")
    exit_request.actual_return = now or timezone.now()
    exit_request.minutes_away = _minutes_between(
        exit_request.actual_departure, exit_request.actual_return
    )
    exit_request.status = ExitPermissionRequest.Status.COMPLETED
    exit_request.save(update_fields=["actual_return", "minutes_away", "status", "updated_at"])
    return exit_request


def document_unauthorized_departure(employee, *, documented_by, note, day=None, now=None):
    """Supervisor documents an unauthorized departure for HR review.

    This records a *reported incident* — it does not assert the employee was absent and it
    applies no penalty. HR reviews it separately.
    """
    if not note or not str(note).strip():
        raise HRError("note_required", "An incident note is required.")
    moment = now or timezone.now()
    return ExitPermissionRequest.objects.create(
        employee=employee,
        department=employee.department or "",
        date=day or moment.date(),
        requested_departure=moment.time().replace(microsecond=0),
        expected_return=moment.time().replace(microsecond=0),
        reason="Unauthorized departure documented by supervisor",
        status=ExitPermissionRequest.Status.PENDING,
        unauthorized=True,
        documented_by=documented_by,
        documented_at=moment,
        incident_note=str(note).strip()[:300],
    )


# ── Absence / emergency call-out ─────────────────────────────────────────────

def report_absence(
    employee,
    *,
    day,
    category=AbsenceNotification.Category.ILLNESS,
    reason="",
    expected_return_date=None,
    now=None,
):
    """Report an absence. The returned record is the employee's confirmation of receipt."""
    moment = now or timezone.now()
    row, created = AbsenceNotification.objects.get_or_create(
        employee=employee,
        date=day,
        defaults={
            "notified_at": moment,
            "category": category,
            "reason": str(reason or "")[:300],
            "expected_return_date": expected_return_date,
        },
    )
    if not created:
        raise HRError(
            "already_reported",
            "An absence notification already exists for this date; HR can review or update it.",
        )
    return row


def acknowledge_absence(row, *, acknowledged_by, now=None):
    """Supervisor acknowledges the notification (the employee's receipt)."""
    row.acknowledged_by = acknowledged_by
    row.acknowledged_at = now or timezone.now()
    if row.status == AbsenceNotification.Status.SUBMITTED:
        row.status = AbsenceNotification.Status.ACKNOWLEDGED
    row.save(update_fields=["acknowledged_by", "acknowledged_at", "status"])
    return row


def review_absence(row, *, reviewed_by, approve, note=""):
    """HR review of an absence notification."""
    row.reviewed_by = reviewed_by
    row.reviewed_at = timezone.now()
    row.review_note = str(note or "")[:300]
    row.status = (
        AbsenceNotification.Status.APPROVED if approve else AbsenceNotification.Status.REJECTED
    )
    row.save(update_fields=["reviewed_by", "reviewed_at", "review_note", "status"])
    return row


# ── Discipline (human-driven only) ───────────────────────────────────────────

def open_discipline_case(
    employee, *, violation, summary, evidence="", stage=DisciplineCase.Stage.COACHING, opened_by=None
):
    """Open a case. Requires a documented summary — a software flag alone is not enough."""
    if not summary or not str(summary).strip():
        raise HRError(
            "summary_required",
            "A documented summary is required; software flags alone cannot open a case.",
        )
    return DisciplineCase.objects.create(
        employee=employee,
        violation=violation,
        stage=stage,
        status=DisciplineCase.Status.OPEN,
        summary=str(summary).strip()[:300],
        evidence=str(evidence or ""),
        opened_by=opened_by,
        opened_at=timezone.now(),
    )


def record_employee_response(case, *, response, now=None):
    """Record the employee's own explanation (always invited before a decision)."""
    case.employee_response = str(response or "")
    case.responded_at = now or timezone.now()
    if case.status in {DisciplineCase.Status.OPEN, DisciplineCase.Status.INVESTIGATING}:
        case.status = DisciplineCase.Status.AWAITING_RESPONSE
    case.save(update_fields=["employee_response", "responded_at", "status", "updated_at"])
    return case


def decide_discipline_case(case, *, decided_by, stage=None, status=None, note=""):
    """Record the HR decision. Never automatic; the employee response stays on the record."""
    if status is None:
        raise HRError("status_required", "A decision status is required.")
    case.stage = stage or case.stage
    case.status = status
    case.decided_by = decided_by
    case.decided_at = timezone.now()
    case.decision_note = str(note or "")[:300]
    if status in {DisciplineCase.Status.CLOSED, DisciplineCase.Status.DISMISSED}:
        case.closed_at = case.decided_at
    case.save(
        update_fields=[
            "stage",
            "status",
            "decided_by",
            "decided_at",
            "decision_note",
            "closed_at",
            "updated_at",
        ]
    )
    return case


# ── Performance, development, recognition, policy ────────────────────────────

def assign_task(
    employee, *, title, period=PerformanceTask.Period.DAILY, description="", due_date=None,
    assigned_by=None, supervisor=None,
):
    """Assign a documented task / objective."""
    if not title or not str(title).strip():
        raise HRError("title_required", "A task title is required.")
    return PerformanceTask.objects.create(
        employee=employee,
        title=str(title).strip()[:200],
        description=str(description or ""),
        period=period,
        due_date=due_date,
        assigned_by=assigned_by,
        supervisor=supervisor,
    )


def update_task(task, *, status=None, progress=None, now=None):
    """Update task status/progress (employee-reported). Completion stamps the time."""
    if status is not None:
        task.status = status
        if status == PerformanceTask.Status.COMPLETED:
            task.completed_at = now or timezone.now()
    if progress is not None:
        task.progress = max(0, min(100, int(progress)))
    task.save(update_fields=["status", "progress", "completed_at", "updated_at"])
    return task


def score_task(task, *, quality_score, feedback="", scored_by=None, now=None):
    """Supervisor quality assessment + feedback on a completed task."""
    task.quality_score = max(0, min(100, int(quality_score)))
    task.feedback = str(feedback or "")[:300]
    task.feedback_by = scored_by
    task.feedback_at = now or timezone.now()
    task.save(
        update_fields=["quality_score", "feedback", "feedback_by", "feedback_at", "updated_at"]
    )
    return task


def refresh_overdue_tasks(day=None) -> int:
    """Mark past-due open tasks as overdue. Returns the count (documented, not punitive)."""
    day = day or timezone.localdate()
    tasks = PerformanceTask.objects.filter(
        due_date__lt=day,
        status__in=[PerformanceTask.Status.ASSIGNED, PerformanceTask.Status.IN_PROGRESS],
    )
    count = tasks.count()
    if count:
        tasks.update(status=PerformanceTask.Status.OVERDUE)
    return count


def write_review(
    employee, *, period_start, period_end, scores, reviewer=None, strengths="", improvements="",
    development_goals="", notes="",
):
    """Write a documented performance review across the Founder/CEO's twelve criteria."""
    cleaned = {
        key: max(1, min(5, int(value)))
        for key, value in (scores or {}).items()
        if key in PerformanceReview.CRITERIA
    }
    if not cleaned:
        raise HRError(
            "scores_required", "At least one criterion score is required (1-5)."
        )
    return PerformanceReview.objects.create(
        employee=employee,
        period_start=period_start,
        period_end=period_end,
        scores=cleaned,
        reviewer=reviewer,
        reviewed_at=timezone.now(),
        strengths=str(strengths or ""),
        improvements=str(improvements or ""),
        development_goals=str(development_goals or ""),
        notes=str(notes or "")[:300],
    )


def assign_training(
    employee, *, title, category=TrainingRecord.Category.REQUIRED, due_date=None, assigned_by=None
):
    """Assign training. No completion is inferred — a human records it."""
    if not title or not str(title).strip():
        raise HRError("title_required", "A training title is required.")
    return TrainingRecord.objects.create(
        employee=employee,
        title=str(title).strip()[:200],
        category=category,
        due_date=due_date,
        assigned_by=assigned_by,
    )


def complete_training(
    record, *, assessment_score=None, learning_progress="", feedback="", feedback_by=None
):
    """Record training completion and the assessment (entered by the assessor)."""
    record.status = TrainingRecord.Status.COMPLETED
    record.completed_at = timezone.now()
    if assessment_score is not None:
        record.assessment_score = max(0, min(100, int(assessment_score)))
    record.learning_progress = str(learning_progress or "")[:200]
    record.supervisor_feedback = str(feedback or "")[:300]
    record.feedback_by = feedback_by
    record.feedback_at = timezone.now()
    record.save(
        update_fields=[
            "status",
            "completed_at",
            "assessment_score",
            "learning_progress",
            "supervisor_feedback",
            "feedback_by",
            "feedback_at",
            "updated_at",
        ]
    )
    return record


def award_recognition(employee, *, category, title, description="", evidence="", period="", awarded_by=None):
    """Record recognition based on documented performance. No money is awarded."""
    if not title or not str(title).strip():
        raise HRError("title_required", "A recognition title is required.")
    return Recognition.objects.create(
        employee=employee,
        category=category,
        title=str(title).strip()[:200],
        description=str(description or "")[:300],
        evidence=str(evidence or "")[:300],
        period=str(period or "")[:40],
        awarded_by=awarded_by,
        awarded_at=timezone.now(),
    )


def acknowledge_policy(employee, *, policy_key, policy_version, acknowledged_by=None, auth_context=""):
    """Record an employee's acknowledgment of a policy version.

    Deliberately independent of the ID-card signature: a stored card signature is never applied
    to agreements automatically.
    """
    row, created = PolicyAcknowledgment.objects.get_or_create(
        employee=employee,
        policy_key=str(policy_key)[:60],
        policy_version=str(policy_version)[:40],
        defaults={
            "acknowledged_at": timezone.now(),
            "acknowledged_by": acknowledged_by,
            "auth_context": str(auth_context or "")[:200],
        },
    )
    return row, created
