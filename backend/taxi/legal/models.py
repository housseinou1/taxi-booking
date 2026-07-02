from django.conf import settings
from django.db import models


class LegalComplianceLog(models.Model):
    """Immutable audit trail for legal acceptances and e-signatures."""

    AGREEMENT_TYPES = [
        ("courier", "Yala Delivery Courier"),
        ("merchant", "Yala Merchant"),
        ("customer_delivery", "Yala Delivery Customer"),
        ("rider", "Yala Rider"),
        ("driver", "Yala Driver"),
    ]

    ACTION_CHOICES = [
        ("e_sign", "Electronic Signature"),
        ("checkbox_accept", "Checkbox Acceptance"),
        ("resign", "Re-signed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="legal_compliance_logs",
    )
    agreement_type = models.CharField(max_length=30, choices=AGREEMENT_TYPES)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, default="e_sign")
    terms_version = models.CharField(max_length=30, blank=True, default="")
    signed_full_name = models.CharField(max_length=200, blank=True, default="")
    signature_image = models.ImageField(
        upload_to="legal/signatures/",
        null=True,
        blank=True,
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    device_info = models.TextField(blank=True, default="")
    app_version = models.CharField(max_length=40, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["agreement_type", "-created_at"], name="legal_log_type_idx"),
            models.Index(fields=["user", "-created_at"], name="legal_log_user_idx"),
        ]

    def __str__(self):
        return f"{self.agreement_type} · {self.terms_version} · {self.user_id}"
