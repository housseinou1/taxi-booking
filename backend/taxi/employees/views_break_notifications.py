"""Break notification API (employee popups, supervisor break status, HR sweep).

* Employees read their own pending notifications (popup + sound flag) — never another
  employee's, and never any code or private data.
* Supervisors see break status for their scope only (department/office filters).
* The dispatch sweep is idempotent: a repeated call cannot duplicate a notification.
* No break start/end time is ever written by a notification — only the employee's own
  Start/End break actions record real break times.
"""

from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BreakNotification, StaffEmployee
from .permissions import IsHrStaff
from .services import break_notification_service as break_notifications
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


class BreakNotificationBaseView(APIView):
    permission_classes = [IsAuthenticated]


class BreakNotificationPendingView(BreakNotificationBaseView):
    """GET — pending break notifications for the signed-in employee (popup + sound).

    Reading marks them delivered, so each notification appears exactly once.
    """

    def get(self, request):
        employee = _employee_for(request)
        if employee is None:
            return Response(
                {"detail": "No employee record is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        break_notifications.dispatch_break_notifications()
        notifications = break_notifications.pending_for_employee(employee)
        return Response(
            {
                "employee_number": employee.employee_number,
                "count": len(notifications),
                "notifications": notifications,
                "schedule": break_notifications.schedule_preview(employee),
            }
        )


class BreakNotificationAckView(BreakNotificationBaseView):
    """POST — acknowledge a notification (employee)."""

    def post(self, request, pk):
        employee = _employee_for(request)
        if employee is None:
            return Response(
                {"detail": "No employee record is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = BreakNotification.objects.filter(pk=pk, employee=employee).first()
        if row is None:
            return Response(
                {"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND
            )
        break_notifications.acknowledge(row)
        return Response({"id": row.id, "acknowledged_at": row.acknowledged_at})


class BreakStatusView(BreakNotificationBaseView):
    """GET — supervisor break status (HR Staff), scoped by department/office."""

    permission_classes = [IsHrStaff]

    def get(self, request):
        break_notifications.dispatch_break_notifications()
        rows = break_notifications.break_status_rows(
            day=_parse_date(request.query_params.get("date")),
            city=request.query_params.get("city") or None,
            department=request.query_params.get("department") or None,
        )
        return Response(
            {
                "count": len(rows),
                "on_break": sum(1 for row in rows if row["on_break"]),
                "overdue": sum(1 for row in rows if row["break_overdue"]),
                "rows": rows,
                "schedule": break_notifications.schedule_preview(),
            }
        )


class BreakNotificationRunView(BreakNotificationBaseView):
    """POST — run the automatic dispatch sweep now (HR Staff, for testing/local dev)."""

    permission_classes = [IsHrStaff]

    def post(self, request):
        created = break_notifications.dispatch_break_notifications()
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Break notification sweep: {created} created",
            entity_type=ENTITY_EMPLOYEE,
            details={"created": created},
        )
        return Response({"created": created})
