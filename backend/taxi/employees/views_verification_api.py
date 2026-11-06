"""Hourly verification API (employee self-service, supervisor monitoring, CEO overview).

Security notes
==============
* **No endpoint ever returns a verification code.** The code is generated server-side, stored
  only as a salted hash, sent to the employee's verified phone, and validated in constant time.
* The lock is enforced by the backend (``session_status``), so a page refresh, a new browser tab
  or a direct API call cannot bypass it — the portal reads the lock state from the server.
* Employees, supervisors and administrators can all *monitor* verification results, but none of
  them can create, choose or read a code.
* SMS delivery uses the **mock** provider in local development; nothing is sent externally.
"""

from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StaffEmployee
from .permissions import IsEmployeeAdministrator, IsHrManager, IsHrStaff
from .services import verification_service as verification
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


class VerificationBaseView(APIView):
    permission_classes = [IsAuthenticated]

    def _fail(self, exc):
        return Response(
            {"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST
        )

    def _actor_employee(self, request):
        employee = _employee_for(request)
        if employee is None:
            return None, Response(
                {"detail": "No employee record is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return employee, None


class VerificationStatusView(VerificationBaseView):
    """GET — the current verification lock state for the signed-in employee.

    Returns the countdown, attempts/resends remaining and the masked phone number — **never the
    code**. The portal must honour ``locked`` for every protected action.
    """

    def get(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        # Keep the challenge set current before reporting the lock state.
        verification.schedule_due_challenges()
        verification.expire_due_challenges()
        payload = verification.session_status(employee)
        payload["employee_number"] = employee.employee_number
        payload["sms_provider"] = verification.sms_provider_name()
        return Response(payload)


class VerificationSubmitView(VerificationBaseView):
    """POST — submit the six-digit code. Single use, five-minute expiry, bounded attempts."""

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        try:
            challenge = verification.submit_code(employee, request.data.get("code"))
        except verification.VerificationError as exc:
            log_employee_event(
                request,
                event="employee.attendance_access",
                summary=f"Verification attempt rejected for {employee.employee_number}",
                entity_type=ENTITY_EMPLOYEE,
                entity_id=employee.employee_number,
                # The code itself is NEVER logged.
                details={"reason": exc.code},
            )
            return self._fail(exc)

        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Hourly verification completed for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"challenge_id": challenge.id},
        )
        return Response(
            {"verified": True, "locked": False, "verified_at": challenge.verified_at}
        )


class VerificationResendView(VerificationBaseView):
    """POST — request another code (bounded by the resend limit and a cooldown)."""

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        try:
            challenge = verification.resend_code(employee)
        except verification.VerificationError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Verification code re-sent for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"resend_count": challenge.resend_count, "sms_status": challenge.sms_status},
        )
        return Response(
            {
                "resent": True,
                "resends_remaining": max(0, challenge.max_resends - challenge.resend_count),
                "expires_at": challenge.expires_at,
                "sms_status": challenge.sms_status,
            }
        )


class VerificationRecoveryView(VerificationBaseView):
    """POST — escalate to a supervisor (secure recovery path)."""

    def post(self, request):
        employee, error = self._actor_employee(request)
        if error:
            return error
        try:
            challenge = verification.request_recovery(employee, note=request.data.get("note"))
        except verification.VerificationError as exc:
            return self._fail(exc)
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Verification recovery requested by {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"challenge_id": challenge.id},
        )
        return Response(
            {
                "recovery_requested": True,
                "status": challenge.status,
                "message": (
                    "Your supervisor has been notified. The session stays locked until the "
                    "recovery is reviewed."
                ),
            }
        )


class VerificationMonitoringView(VerificationBaseView):
    """GET — live verification monitoring (HR Staff / supervisor).

    Supervisors see verification results for their scope; **no code is ever exposed**. Use
    ``?department=`` and ``?city=`` to scope, matching the existing role boundaries.
    """

    permission_classes = [IsHrStaff]

    def get(self, request):
        verification.schedule_due_challenges()
        verification.expire_due_challenges()
        rows = verification.monitoring_rows(
            day=_parse_date(request.query_params.get("date")),
            department=request.query_params.get("department") or None,
            city=request.query_params.get("city") or None,
        )
        return Response(
            {
                "count": len(rows),
                "rows": rows,
                "sms_provider": verification.sms_provider_name(),
                "note": "Verification codes are never exposed through this endpoint.",
            }
        )


class VerificationCeoOverviewView(VerificationBaseView):
    """GET — CEO Command Center verification monitoring (Administrator tier)."""

    permission_classes = [IsEmployeeAdministrator]

    def get(self, request):
        verification.schedule_due_challenges()
        verification.expire_due_challenges()
        payload = verification.ceo_overview(day=_parse_date(request.query_params.get("date")))
        payload["timezone"] = "Africa/Nouakchott"
        payload["cities_supported"] = list(verification.attendance.ATTENDANCE_CITIES)
        return Response(payload)


class VerificationRunView(VerificationBaseView):
    """POST — run the automatic scheduler and the expiry sweep now (HR Staff).

    The same work runs automatically on the backend; this endpoint exists so HR can force a
    sweep for testing and for the local development environment.
    """

    permission_classes = [IsHrStaff]

    def post(self, request):
        issued = verification.schedule_due_challenges()
        missed = verification.expire_due_challenges()
        log_employee_event(
            request,
            event="employee.attendance_access",
            summary=f"Verification sweep: {issued} issued, {missed} missed",
            entity_type=ENTITY_EMPLOYEE,
            details={"issued": issued, "missed": missed},
        )
        return Response({"issued": issued, "missed": missed})
