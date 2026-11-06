"""HR workflow API: exit permission, absence, discipline, performance, development, policy.

All routes are authenticated. Tiers reuse the existing employee permission classes: employees
act on their own records, HR Staff can view/document, HR Manager can decide and manage, and the
CEO/Administrator tier reads the company overview. Nothing here approves, disciplines, scores or
pays automatically.
"""

from __future__ import annotations

from datetime import date, time as _time

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AbsenceNotification,
    DisciplineCase,
    ExitPermissionRequest,
    PerformanceReview,
    PerformanceTask,
    PolicyAcknowledgment,
    Recognition,
    StaffEmployee,
    TrainingRecord,
)
from .permissions import IsEmployeeAdministrator, IsHrManager, IsHrStaff
from .services import hr_service
from .services.audit import ENTITY_EMPLOYEE, log_employee_event


def _employee_for(request):
    return StaffEmployee.objects.filter(user=request.user).first()


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _parse_time(value):
    """Accept "HH:MM" or "HH:MM:SS"."""
    if not value:
        return None
    try:
        parts = str(value).split(":")
        return _time(int(parts[0]), int(parts[1]))
    except (TypeError, ValueError, IndexError):
        return None


class HRBaseView(APIView):
    permission_classes = [IsAuthenticated]

    def _fail(self, exc):
        return Response(
            {"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST
        )

    def _actor_employee(self, request):
        """The signed-in employee (self-service) or a 403 response."""
        employee = _employee_for(request)
        if employee is None:
            return None, Response(
                {"detail": "No employee record is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return employee, None


class ExitPermissionView(HRBaseView):
    """GET/POST — permission to leave the office (mandatory feature)."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsAuthenticated()]

    def get(self, request):
        queryset = ExitPermissionRequest.objects.select_related("employee")
        city = request.query_params.get("city") or None
        day = _parse_date(request.query_params.get("date"))
        if city:
            queryset = queryset.filter(employee__office_city=city)
        if day:
            queryset = queryset.filter(date=day)
        return Response(
            {
                "exit_requests": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "department": row.department,
                        "date": row.date.isoformat(),
                        "requested_departure": row.requested_departure.strftime("%H:%M"),
                        "expected_return": row.expected_return.strftime("%H:%M"),
                        "reason": row.reason,
                        "status": row.status,
                        "is_emergency": row.is_emergency,
                        "unauthorized": row.unauthorized,
                        "incident_note": row.incident_note,
                        "minutes_away": row.minutes_away,
                    }
                    for row in queryset[:200]
                ]
            }
        )

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        day = _parse_date(request.data.get("date")) or date.today()
        departure = _parse_time(request.data.get("requested_departure"))
        expected = _parse_time(request.data.get("expected_return"))
        if departure is None or expected is None:
            return Response(
                {"detail": "Provide requested_departure and expected_return as HH:MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            row = hr_service.request_exit(
                employee,
                day=day,
                requested_departure=departure,
                expected_return=expected,
                reason=request.data.get("reason"),
                requested_by=request.user,
                is_emergency=bool(request.data.get("is_emergency")),
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Exit permission requested by {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"exit_request_id": row.id, "emergency": row.is_emergency},
        )
        return Response({"id": row.id, "status": row.status}, status=status.HTTP_201_CREATED)


class ExitPermissionActionView(HRBaseView):
    """POST — decide an exit request, record departure/return, or document an incident.

    ``decide`` and ``document-unauthorized`` require an HR Staff (supervisor/HR) session;
    ``departure``/``return`` are the employee's own actions.
    """

    def post(self, request, action, pk=None):
        if action in {"decide", "document-unauthorized"} and not IsHrStaff().has_permission(
            request, self
        ):
            return Response(
                {"detail": "This action requires a supervisor or HR session."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if action == "document-unauthorized":
            employee = StaffEmployee.objects.filter(
                employee_number=str(request.data.get("employee_number") or "").strip()
            ).first()
            if employee is None:
                return Response(
                    {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
                )
            try:
                row = hr_service.document_unauthorized_departure(
                    employee, documented_by=request.user, note=request.data.get("note")
                )
            except hr_service.HRError as exc:
                return self._fail(exc)
            log_employee_event(
                request,
                event="employee.attendance_access",
                summary=f"Unauthorized departure documented for {employee.employee_number}",
                entity_type=ENTITY_EMPLOYEE,
                entity_id=employee.employee_number,
                details={"exit_request_id": row.id},
            )
            return Response({"id": row.id, "unauthorized": True}, status=status.HTTP_201_CREATED)

        row = ExitPermissionRequest.objects.filter(pk=pk).select_related("employee").first()
        if row is None:
            return Response(
                {"detail": "Exit request not found."}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            if action == "decide":
                hr_service.decide_exit(
                    row,
                    decided_by=request.user,
                    approve=str(request.data.get("approve", "true")).lower() != "false",
                    note=request.data.get("note"),
                )
            elif action == "departure":
                hr_service.record_departure(row)
            elif action == "return":
                hr_service.record_return(row)
            else:
                return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)
        except hr_service.HRError as exc:
            return self._fail(exc)

        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Exit request {action} for {row.employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=row.employee.employee_number,
            details={"exit_request_id": row.id, "status": row.status},
        )
        return Response(
            {
                "id": row.id,
                "status": row.status,
                "minutes_away": row.minutes_away,
                "actual_departure": row.actual_departure,
                "actual_return": row.actual_return,
            }
        )



class AbsenceView(HRBaseView):
    """GET/POST — report absence / emergency call-out."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsAuthenticated()]

    def get(self, request):
        queryset = AbsenceNotification.objects.select_related("employee")
        city = request.query_params.get("city") or None
        day = _parse_date(request.query_params.get("date"))
        if city:
            queryset = queryset.filter(employee__office_city=city)
        if day:
            queryset = queryset.filter(date=day)
        return Response(
            {
                "absences": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "date": row.date.isoformat(),
                        "notified_at": row.notified_at,
                        "category": row.category,
                        "reason": row.reason,
                        "expected_return_date": (
                            row.expected_return_date.isoformat()
                            if row.expected_return_date
                            else None
                        ),
                        "status": row.status,
                        "acknowledged_at": row.acknowledged_at,
                        "review_note": row.review_note,
                    }
                    for row in queryset[:200]
                ]
            }
        )

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        day = _parse_date(request.data.get("date")) or date.today()
        try:
            row = hr_service.report_absence(
                employee,
                day=day,
                category=request.data.get("category") or AbsenceNotification.Category.ILLNESS,
                reason=request.data.get("reason"),
                expected_return_date=_parse_date(request.data.get("expected_return_date")),
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Absence reported by {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"absence_id": row.id, "category": row.category},
        )
        return Response(
            {
                "id": row.id,
                "status": row.status,
                "notified_at": row.notified_at,
                "confirmation": (
                    "Your absence notification has been received and is awaiting review."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class AbsenceActionView(HRBaseView):
    """POST — supervisor acknowledges, HR reviews an absence notification."""

    permission_classes = [IsHrStaff]

    def post(self, request, action, pk):
        row = AbsenceNotification.objects.filter(pk=pk).select_related("employee").first()
        if row is None:
            return Response(
                {"detail": "Absence notification not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if action == "acknowledge":
            hr_service.acknowledge_absence(row, acknowledged_by=request.user)
        elif action == "review":
            hr_service.review_absence(
                row,
                reviewed_by=request.user,
                approve=str(request.data.get("approve", "true")).lower() != "false",
                note=request.data.get("note"),
            )
        else:
            return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)

        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Absence {action} for {row.employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=row.employee.employee_number,
            details={"absence_id": row.id, "status": row.status},
        )
        return Response({"id": row.id, "status": row.status})


# ── Discipline (human-driven only; nothing is automatic) ─────────────────────


def _case_row(case):
    return {
        "id": case.id,
        "employee_number": case.employee.employee_number,
        "employee_name": case.employee.full_name,
        "violation": case.violation,
        "summary": case.summary,
        "evidence": case.evidence,
        "stage": case.stage,
        "status": case.status,
        "employee_response": case.employee_response,
        "responded_at": case.responded_at,
        "decided_at": case.decided_at,
        "decision_note": case.decision_note,
        "opened_at": case.opened_at,
    }


class DisciplineCaseView(HRBaseView):
    """GET/POST — discipline cases. Opening a case is documentation, never a punishment."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsHrManager()]

    def get(self, request):
        queryset = DisciplineCase.objects.select_related("employee").order_by("-opened_at")
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        return Response({"cases": [_case_row(case) for case in queryset[:300]]})

    def post(self, request):
        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            case = hr_service.open_discipline_case(
                employee,
                violation=request.data.get("violation"),
                summary=request.data.get("summary"),
                evidence=request.data.get("evidence") or "",
                stage=request.data.get("stage") or DisciplineCase.Stage.COACHING,
                opened_by=request.user,
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Discipline case opened for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"case_id": case.id, "stage": case.stage},
        )
        return Response(_case_row(case), status=status.HTTP_201_CREATED)


class DisciplineCaseActionView(HRBaseView):
    """POST — ``respond`` (the employee's own reply) or ``decide`` (HR Manager only)."""

    def post(self, request, pk, action):
        case = (
            DisciplineCase.objects.filter(pk=pk).select_related("employee").first()
        )
        if case is None:
            return Response(
                {"detail": "Discipline case not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if action == "respond":
            actor, error = self._actor_employee(request)
            if error:
                return error
            if actor.id != case.employee_id:
                return Response(
                    {"detail": "This is not your discipline case."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                hr_service.record_employee_response(
                    case, response=request.data.get("response")
                )
            except hr_service.HRError as exc:
                return self._fail(exc)
        elif action == "decide":
            if not IsHrManager().has_permission(request, self):
                return Response(
                    {"detail": "This action requires an HR Manager session."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                hr_service.decide_discipline_case(
                    case,
                    decided_by=request.user,
                    stage=request.data.get("stage") or None,
                    status=request.data.get("status") or None,
                    note=request.data.get("note"),
                )
            except hr_service.HRError as exc:
                return self._fail(exc)
        else:
            return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)

        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Discipline {action} for {case.employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=case.employee.employee_number,
            details={"case_id": case.id, "status": case.status},
        )
        return Response(_case_row(case))


# ── Performance: tasks, objectives and reviews ───────────────────────────────


def _task_row(task):
    return {
        "id": task.id,
        "employee_number": task.employee.employee_number,
        "employee_name": task.employee.full_name,
        "title": task.title,
        "description": task.description,
        "period": task.period,
        "due_date": task.due_date,
        "status": task.status,
        "progress": task.progress,
        "completed_at": task.completed_at,
        "quality_score": task.quality_score,
        "feedback": task.feedback,
    }


class PerformanceTaskView(HRBaseView):
    """GET/POST — daily, weekly and monthly objectives. Human-entered, never auto-scored."""

    def get(self, request):
        if not IsHrStaff().has_permission(request, self):
            return Response(
                {"detail": "This view requires a supervisor or HR session."},
                status=status.HTTP_403_FORBIDDEN,
            )
        queryset = PerformanceTask.objects.select_related("employee").order_by("-created_at")
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        task_status = str(request.query_params.get("status") or "").strip()
        if task_status:
            queryset = queryset.filter(status=task_status)
        return Response({"tasks": [_task_row(task) for task in queryset[:300]]})

    def post(self, request):
        if not IsHrStaff().has_permission(request, self):
            return Response(
                {"detail": "Assigning objectives requires a supervisor or HR session."},
                status=status.HTTP_403_FORBIDDEN,
            )
        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            task = hr_service.assign_task(
                employee,
                title=request.data.get("title"),
                period=request.data.get("period") or PerformanceTask.Period.DAILY,
                description=request.data.get("description") or "",
                due_date=_parse_date(request.data.get("due_date")),
                assigned_by=request.user,
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Objective assigned to {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"task_id": task.id, "period": task.period},
        )
        return Response(_task_row(task), status=status.HTTP_201_CREATED)


class PerformanceTaskActionView(HRBaseView):
    """POST — ``update`` (progress/status) or ``score`` (supervisor feedback)."""

    def post(self, request, pk, action):
        task = PerformanceTask.objects.filter(pk=pk).select_related("employee").first()
        if task is None:
            return Response(
                {"detail": "Objective not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if action == "update":
            try:
                hr_service.update_task(
                    task,
                    status=request.data.get("status") or None,
                    progress=request.data.get("progress"),
                )
            except hr_service.HRError as exc:
                return self._fail(exc)
        elif action == "score":
            if not IsHrStaff().has_permission(request, self):
                return Response(
                    {"detail": "Scoring requires a supervisor or HR session."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                hr_service.score_task(
                    task,
                    quality_score=request.data.get("quality_score"),
                    feedback=request.data.get("feedback") or "",
                    scored_by=request.user,
                )
            except hr_service.HRError as exc:
                return self._fail(exc)
        else:
            return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_task_row(task))


class PerformanceReviewView(HRBaseView):
    """GET/POST — documented reviews across the Founder/CEO's evaluation criteria."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsHrManager()]

    def get(self, request):
        queryset = PerformanceReview.objects.select_related("employee").order_by("-created_at")
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        return Response(
            {
                "reviews": [
                    {
                        "id": review.id,
                        "employee_number": review.employee.employee_number,
                        "employee_name": review.employee.full_name,
                        "period_start": review.period_start,
                        "period_end": review.period_end,
                        "scores": review.scores,
                        "strengths": review.strengths,
                        "improvements": review.improvements,
                        "development_goals": review.development_goals,
                        "notes": review.notes,
                        "reviewed_at": review.reviewed_at,
                    }
                    for review in queryset[:200]
                ],
                "criteria": list(PerformanceReview.CRITERIA),
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
        try:
            review = hr_service.write_review(
                employee,
                period_start=_parse_date(request.data.get("period_start")),
                period_end=_parse_date(request.data.get("period_end")),
                scores=request.data.get("scores") or {},
                reviewer=request.user,
                strengths=request.data.get("strengths") or "",
                improvements=request.data.get("improvements") or "",
                development_goals=request.data.get("development_goals") or "",
                notes=request.data.get("notes") or "",
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Performance review written for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"review_id": review.id},
        )
        return Response(
            {"id": review.id, "scores": review.scores}, status=status.HTTP_201_CREATED
        )


# ── Training, recognition and policy acknowledgment ──────────────────────────


class EmployeeLinkageView(HRBaseView):
    """GET /employees/me/linkage/ — does this account have an employee profile?

    Employee *self-service* endpoints (attendance clock state, my-attendance, exit
    permission, policy acknowledgment) can only work for an account that is linked to a
    StaffEmployee. An administrator is typically NOT an employee, so calling those
    endpoints for them always yields 403 "No employee record is linked to this account."

    This cheap probe lets the admin UI decide *before* issuing those calls, instead of
    generating avoidable 403s. It is read-only and exposes only the caller's own linkage.
    """

    def get(self, request):
        employee = _employee_for(request)
        return Response(
            {
                "linked": employee is not None,
                "employee_number": employee.employee_number if employee else None,
                "employee_name": employee.full_name if employee else None,
            }
        )



def _training_row(record):
    return {
        "id": record.id,
        "employee_number": record.employee.employee_number,
        "employee_name": record.employee.full_name,
        "title": record.title,
        "category": record.category,
        "status": record.status,
        "due_date": record.due_date,
        "completed_at": record.completed_at,
        "assessment_score": record.assessment_score,
        "learning_progress": record.learning_progress,
        "supervisor_feedback": record.supervisor_feedback,
    }


class TrainingView(HRBaseView):
    """GET/POST — onboarding, mandatory, departmental and professional development."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsHrManager()]

    def get(self, request):
        queryset = TrainingRecord.objects.select_related("employee").order_by("-created_at")
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        return Response({"training": [_training_row(rec) for rec in queryset[:300]]})

    def post(self, request):
        employee = StaffEmployee.objects.filter(
            employee_number=str(request.data.get("employee_number") or "").strip()
        ).first()
        if employee is None:
            return Response(
                {"detail": "Unknown employee number."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            record = hr_service.assign_training(
                employee,
                title=request.data.get("title"),
                category=request.data.get("category") or TrainingRecord.Category.REQUIRED,
                due_date=_parse_date(request.data.get("due_date")),
                assigned_by=request.user,
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Training assigned to {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"training_id": record.id, "category": record.category},
        )
        return Response(_training_row(record), status=status.HTTP_201_CREATED)


class TrainingActionView(HRBaseView):
    """POST ``complete`` — records completion, score and supervisor feedback."""

    def post(self, request, pk, action):
        record = TrainingRecord.objects.filter(pk=pk).select_related("employee").first()
        if record is None:
            return Response(
                {"detail": "Training record not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if action != "complete":
            return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)
        if not IsHrStaff().has_permission(request, self):
            return Response(
                {"detail": "Recording completion requires a supervisor or HR session."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            hr_service.complete_training(
                record,
                assessment_score=request.data.get("assessment_score"),
                learning_progress=request.data.get("learning_progress") or "",
                feedback=request.data.get("feedback") or "",
                feedback_by=request.user,
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        return Response(_training_row(record))


class RecognitionView(HRBaseView):
    """GET/POST — evidence-based, strictly non-monetary recognition."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsHrManager()]

    def get(self, request):
        queryset = Recognition.objects.select_related("employee").order_by("-created_at")
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        return Response(
            {
                "recognitions": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "category": row.category,
                        "title": row.title,
                        "description": row.description,
                        "evidence": row.evidence,
                        "period": row.period,
                        "awarded_at": row.awarded_at,
                    }
                    for row in queryset[:300]
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
        try:
            row = hr_service.award_recognition(
                employee,
                category=request.data.get("category"),
                title=request.data.get("title"),
                description=request.data.get("description") or "",
                evidence=request.data.get("evidence") or "",
                period=request.data.get("period") or "",
                awarded_by=request.user,
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Recognition awarded to {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"recognition_id": row.id, "category": row.category},
        )
        return Response(
            {"id": row.id, "category": row.category}, status=status.HTTP_201_CREATED
        )


class PolicyAcknowledgmentView(HRBaseView):
    """GET/POST — policy acknowledgment, kept separate from the ID-card signature."""

    def get_permissions(self):
        return [IsHrStaff()] if self.request.method == "GET" else [IsAuthenticated()]

    def get(self, request):
        queryset = PolicyAcknowledgment.objects.select_related("employee").order_by(
            "-acknowledged_at"
        )
        employee_number = str(request.query_params.get("employee_number") or "").strip()
        if employee_number:
            queryset = queryset.filter(employee__employee_number=employee_number)
        return Response(
            {
                "acknowledgments": [
                    {
                        "id": row.id,
                        "employee_number": row.employee.employee_number,
                        "employee_name": row.employee.full_name,
                        "policy_key": row.policy_key,
                        "policy_version": row.policy_version,
                        "acknowledged_at": row.acknowledged_at,
                        "auth_context": row.auth_context,
                    }
                    for row in queryset[:500]
                ]
            }
        )

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        try:
            row, created = hr_service.acknowledge_policy(
                employee,
                policy_key=request.data.get("policy_key"),
                policy_version=request.data.get("policy_version"),
                acknowledged_by=request.user,
                auth_context=request.data.get("auth_context") or "",
            )
        except hr_service.HRError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Policy acknowledged by {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"policy_key": row.policy_key, "created": created},
        )
        return Response(
            {
                "id": row.id,
                "policy_key": row.policy_key,
                "policy_version": row.policy_version,
                "acknowledged_at": row.acknowledged_at,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )





