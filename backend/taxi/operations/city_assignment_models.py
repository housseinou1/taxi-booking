"""Explicit staff -> city assignments (Task 8).

Replaces nothing yet: it is the foundation for city-scoped administration. An assignment
names one staff user, one ``locations.City`` (the same city table as OpsCityProfile) and the
role the user holds in that city. Several users may hold the same role in the same city.

Assignments are never deleted by the API: revoking sets ``is_active=False`` and records who
revoked it and when, so the history stays auditable.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class StaffCityAssignment(models.Model):
    ROLE_OPERATIONS_MANAGER = "operations_manager"
    ROLE_SUPERVISOR = "supervisor"
    ROLE_SUPPORT = "support"
    ROLE_FINANCE = "finance"
    ROLE_CHOICES = [
        (ROLE_OPERATIONS_MANAGER, "City Operations Manager"),
        (ROLE_SUPERVISOR, "City Supervisor"),
        (ROLE_SUPPORT, "City Support Staff"),
        (ROLE_FINANCE, "City Finance Staff"),
    ]
    # The staff group a user must already belong to before receiving the role.
    ROLE_REQUIRED_GROUPS = {
        ROLE_OPERATIONS_MANAGER: {"Operations Manager"},
        ROLE_SUPERVISOR: {"Supervisor"},
        ROLE_SUPPORT: {"Support"},
        ROLE_FINANCE: {"Finance", "Accountant"},
    }

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="city_assignments"
    )
    city = models.ForeignKey("locations.City", on_delete=models.PROTECT, related_name="staff_assignments")
    role = models.CharField(max_length=32, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default="")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["city_id", "role", "user_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "city", "role"],
                condition=Q(is_active=True),
                name="uniq_active_staff_city_role",
            ),
        ]
        indexes = [models.Index(fields=["user", "is_active"], name="staff_city_user_active_idx")]

    def __str__(self) -> str:
        state = "active" if self.is_active else "revoked"
        return f"{self.user_id} -> city {self.city_id} ({self.role}, {state})"
