"""Phase 39 — YALA Academy permissions."""

from operations.executive_permissions import (
    IsAcademyAdminStaff,
    IsAcademyReportStaff,
    can_manage_academy,
    can_view_academy_reports,
)

# Backward-compatible aliases used by views.
IsAcademyAdmin = IsAcademyAdminStaff
IsCEOrAdmin = IsAcademyReportStaff

__all__ = [
    "IsAcademyAdmin",
    "IsCEOrAdmin",
    "IsAcademyAdminStaff",
    "IsAcademyReportStaff",
    "can_manage_academy",
    "can_view_academy_reports",
]
