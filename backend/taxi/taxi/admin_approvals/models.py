"""
Approval audit models for the Admin Approval Center.
Records every approval action for complete traceability.
"""
from django.conf import settings
from django.db import models


class ApprovalAction(models.Model):
    """Immutable audit log for every approval/rejection/suspension action."""

    ACTION_CHOICES = [
        ("approve", "Approved"),
        ("reject", "Rejected"),
        ("suspend", "Suspended"),
        ("reactivate", "Reactivated"),
        ("request_info", "Requested More Information"),
    ]

    TARGET_TYPE_CHOICES = [
        ("rider", "Rider"),
        ("driver", "Driver"),
        ("courier", "Delivery Courier"),
    ]

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="approval_actions",
    )
    admin_name = models.CharField(max_length=200, blank=True, default="")
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="approval_history",
    )
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    is_ceo_override = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_user", "-created_at"], name="approval_target_idx"),
            models.Index(fields=["target_type", "action", "-created_at"], name="approval_type_action_idx"),
            models.Index(fields=["admin", "-created_at"], name="approval_admin_idx"),
        ]

    def __str__(self):
        return f"{self.admin_name} {self.action} {self.target_type} #{self.target_user_id}"
