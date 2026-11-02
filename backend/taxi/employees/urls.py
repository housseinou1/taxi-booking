"""Employee Management URLs (staff-gated; mounted at the API root).

Every staff route resolves to ``StaffEmployeeViewSet``, whose per-action
permissions enforce the HR Staff / HR Manager / Administrator tiers.

Phase 11 adds exactly one non-staff route — ``verify/card/<uuid>/`` — which is
**disabled by default** and answers 404 until the owner explicitly activates
public QR verification (``PUBLIC_QR_VERIFICATION_ENABLED``).
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from employees.views import StaffEmployeeViewSet
from employees.views_attendance import (
    AttendanceExportView,
    AttendanceIssuesView,
    AttendanceStatusView,
    BreakEndView,
    BreakStartView,
    CeoAttendanceOverviewView,
    ClockInView,
    ClockOutNotificationsView,
    ClockOutView,
    CorrectionListCreateView,
    CorrectionReviewView,
    DailyDashboardView,
    FlagDeadlineView,
    HolidayView,
    LeaveView,
    MonthlyReportView,
    MyAttendanceView,
    OvertimeAuthorizationView,
    PolicyDashboardView,
    ShiftListView,
    WeeklyReportView,
    WorkScheduleView,
)
from employees.views_verification import verify_card_public
from employees.views_break_notifications import (
    BreakNotificationAckView,
    BreakNotificationPendingView,
    BreakNotificationRunView,
    BreakStatusView,
)
from employees.views_hr import (
    AbsenceActionView,
    AbsenceView,
    DisciplineCaseActionView,
    DisciplineCaseView,
    EmployeeLinkageView,
    ExitPermissionActionView,
    ExitPermissionView,
    PerformanceReviewView,
    PerformanceTaskActionView,
    PerformanceTaskView,
    PolicyAcknowledgmentView,
    RecognitionView,
    TrainingActionView,
    TrainingView,
)
from employees.views_verification_api import (
    VerificationCeoOverviewView,
    VerificationMonitoringView,
    VerificationRecoveryView,
    VerificationResendView,
    VerificationRunView,
    VerificationStatusView,
    VerificationSubmitView,
)

router = DefaultRouter()
router.register(r"employees", StaffEmployeeViewSet, basename="employee")

# NOTE: the explicit paths below MUST be listed BEFORE ``router.urls``. The DRF router
# registers ``employees/<employee_number>/status/`` for the ``change_status`` action, which
# otherwise shadows ``employees/attendance/status/`` (with employee_number="attendance") and
# makes AttendanceStatusView unreachable over HTTP.
urlpatterns = [
    # Phase 11 — public ID-card QR verification. Registered but DISABLED by
    # default: while PUBLIC_QR_VERIFICATION_ENABLED is false this path answers
    # 404, so no public surface exists until the owner explicitly activates it.
    path("verify/card/<str:scanned>/", verify_card_public, name="verify-card-public"),
    # ── Employee attendance & time tracking (staff-gated; never public) ───────
    path("employees/attendance/clock-in/", ClockInView.as_view(), name="attendance-clock-in"),
    path("employees/attendance/clock-out/", ClockOutView.as_view(), name="attendance-clock-out"),
    path("employees/attendance/break/start/", BreakStartView.as_view(), name="attendance-break-start"),
    path("employees/attendance/break/end/", BreakEndView.as_view(), name="attendance-break-end"),
    path("employees/attendance/status/", AttendanceStatusView.as_view(), name="attendance-status"),
    path("employees/attendance/me/", MyAttendanceView.as_view(), name="attendance-me"),
    path("employees/attendance/daily/", DailyDashboardView.as_view(), name="attendance-daily"),
    path("employees/attendance/weekly/", WeeklyReportView.as_view(), name="attendance-weekly"),
    path("employees/attendance/monthly/", MonthlyReportView.as_view(), name="attendance-monthly"),
    path("employees/attendance/issues/", AttendanceIssuesView.as_view(), name="attendance-issues"),
    path("employees/attendance/shifts/", ShiftListView.as_view(), name="attendance-shifts"),
    path(
        "employees/attendance/corrections/",
        CorrectionListCreateView.as_view(),
        name="attendance-corrections",
    ),
    path(
        "employees/attendance/corrections/<int:pk>/<str:decision>/",
        CorrectionReviewView.as_view(),
        name="attendance-correction-review",
    ),
    path(
        "employees/attendance/ceo-overview/",
        CeoAttendanceOverviewView.as_view(),
        name="attendance-ceo-overview",
    ),
    # ── Work schedules, leave, holidays and exports ───────────────────────────
    path(
        "employees/attendance/work-schedules/",
        WorkScheduleView.as_view(),
        name="attendance-work-schedules",
    ),
    path("employees/attendance/leave/", LeaveView.as_view(), name="attendance-leave"),
    path("employees/attendance/holidays/", HolidayView.as_view(), name="attendance-holidays"),
    path("employees/attendance/export/", AttendanceExportView.as_view(), name="attendance-export"),
    # ── Official policy endpoints (Founder/CEO) ───────────────────────────────
    path(
        "employees/attendance/notifications/",
        ClockOutNotificationsView.as_view(),
        name="attendance-notifications",
    ),
    path(
        "employees/attendance/policy-dashboard/",
        PolicyDashboardView.as_view(),
        name="attendance-policy-dashboard",
    ),
    path(
        "employees/attendance/flag-deadline/",
        FlagDeadlineView.as_view(),
        name="attendance-flag-deadline",
    ),
    path(
        "employees/attendance/records/<int:pk>/overtime/",
        OvertimeAuthorizationView.as_view(),
        name="attendance-overtime-authorization",
    ),
    # ── Automatic break notifications (Phase 2.3) ─────────────────────────────
    path(
        "employees/attendance/break-notifications/",
        BreakNotificationPendingView.as_view(),
        name="break-notifications",
    ),
    path(
        "employees/attendance/break-notifications/<int:pk>/ack/",
        BreakNotificationAckView.as_view(),
        name="break-notification-ack",
    ),
    path(
        "employees/attendance/break-notifications/run/",
        BreakNotificationRunView.as_view(),
        name="break-notifications-run",
    ),
    path(
        "employees/attendance/break-status/",
        BreakStatusView.as_view(),
        name="break-status",
    ),
    # ── Hourly employee verification (Phase 2.2) ──────────────────────────────
    path(
        "employees/verification/status/",
        VerificationStatusView.as_view(),
        name="verification-status",
    ),
    path(
        "employees/verification/submit/",
        VerificationSubmitView.as_view(),
        name="verification-submit",
    ),
    path(
        "employees/verification/resend/",
        VerificationResendView.as_view(),
        name="verification-resend",
    ),
    path(
        "employees/verification/recovery/",
        VerificationRecoveryView.as_view(),
        name="verification-recovery",
    ),
    path(
        "employees/verification/monitoring/",
        VerificationMonitoringView.as_view(),
        name="verification-monitoring",
    ),
    path(
        "employees/verification/ceo-overview/",
        VerificationCeoOverviewView.as_view(),
        name="verification-ceo-overview",
    ),
    path(
        "employees/verification/run/",
        VerificationRunView.as_view(),
        name="verification-run",
    ),
    # ── HR: exit permission + emergency absence (Phase 2.1) ──────────────────
    path(
        "employees/hr/exit-permissions/",
        ExitPermissionView.as_view(),
        name="hr-exit-permissions",
    ),
    path(
        "employees/hr/exit-permissions/<int:pk>/<str:action>/",
        ExitPermissionActionView.as_view(),
        name="hr-exit-permission-action",
    ),
    path(
        "employees/hr/exit-permissions/<str:action>/",
        ExitPermissionActionView.as_view(),
        name="hr-exit-permission-standalone-action",
    ),
    path("employees/hr/absences/", AbsenceView.as_view(), name="hr-absences"),
    path(
        "employees/hr/absences/<int:pk>/<str:action>/",
        AbsenceActionView.as_view(),
        name="hr-absence-action",
    ),
    # ── HR: discipline (Phase 3.4) ───────────────────────────────────────────
    path(
        "employees/hr/discipline/",
        DisciplineCaseView.as_view(),
        name="hr-discipline-cases",
    ),
    path(
        "employees/hr/discipline/<int:pk>/<str:action>/",
        DisciplineCaseActionView.as_view(),
        name="hr-discipline-case-action",
    ),
    # ── HR: performance (Phase 3.5) ──────────────────────────────────────────
    path(
        "employees/hr/performance/tasks/",
        PerformanceTaskView.as_view(),
        name="hr-performance-tasks",
    ),
    path(
        "employees/hr/performance/tasks/<int:pk>/<str:action>/",
        PerformanceTaskActionView.as_view(),
        name="hr-performance-task-action",
    ),
    path(
        "employees/hr/performance/reviews/",
        PerformanceReviewView.as_view(),
        name="hr-performance-reviews",
    ),
    # ── HR: training (Phase 3.6) ─────────────────────────────────────────────
    path("employees/hr/training/", TrainingView.as_view(), name="hr-training"),
    path(
        "employees/hr/training/<int:pk>/<str:action>/",
        TrainingActionView.as_view(),
        name="hr-training-action",
    ),
    # ── HR: recognition (Phase 3.7) ──────────────────────────────────────────
    path(
        "employees/hr/recognition/",
        RecognitionView.as_view(),
        name="hr-recognition",
    ),
    # ── HR: policy acknowledgment (Phase 3.8) ────────────────────────────────
    path(
        "employees/hr/policy-acknowledgments/",
        PolicyAcknowledgmentView.as_view(),
        name="hr-policy-acknowledgments",
    ),
    # ── Employee self-service linkage probe (prevents avoidable 403s) ────────
    path(
        "employees/me/linkage/",
        EmployeeLinkageView.as_view(),
        name="employee-me-linkage",
    ),
] + router.urls
