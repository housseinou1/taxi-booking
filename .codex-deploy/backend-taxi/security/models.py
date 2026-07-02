from django.conf import settings
from django.db import models


class CustomerSavedAddress(models.Model):
    """Saved delivery addresses for customers."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_addresses",
    )
    label = models.CharField(max_length=80, blank=True, default="")
    address = models.CharField(max_length=500)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_default = models.BooleanField(default=False)
    building_description = models.CharField(max_length=200, blank=True, default="")
    apartment_floor = models.CharField(max_length=80, blank=True, default="")
    landmark = models.CharField(max_length=200, blank=True, default="")
    gate_color = models.CharField(max_length=40, blank=True, default="")
    extra_instructions = models.TextField(blank=True, default="")
    recipient_alt_phone = models.CharField(max_length=30, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "-updated_at"]
        indexes = [
            models.Index(fields=["user", "-updated_at"], name="saved_addr_user_idx"),
        ]

    def __str__(self):
        return f"{self.label or 'Address'} — {self.address[:40]}"


class CustomerDeliveryDefaults(models.Model):
    """Saved dropoff instructions reused on future delivery orders."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_defaults",
    )
    building_description = models.CharField(max_length=200, blank=True, default="")
    apartment_floor = models.CharField(max_length=80, blank=True, default="")
    landmark = models.CharField(max_length=200, blank=True, default="")
    gate_color = models.CharField(max_length=40, blank=True, default="")
    extra_instructions = models.TextField(blank=True, default="")
    recipient_alt_phone = models.CharField(max_length=30, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Delivery defaults — {self.user_id}"


class AuditLog(models.Model):
    """Immutable audit trail for status, payment, refund, admin, and document events."""

    ACTION_CHOICES = [
        ("status_change", "Status Change"),
        ("payment_change", "Payment Change"),
        ("refund", "Refund"),
        ("admin_action", "Admin Action"),
        ("document_approval", "Document Approval"),
        ("verification_event", "Verification Event"),
        ("fraud_flag", "Fraud Flag"),
    ]

    ENTITY_CHOICES = [
        ("delivery", "Delivery"),
        ("merchant", "Merchant"),
        ("courier", "Courier"),
        ("customer", "Customer"),
        ("payment", "Payment"),
        ("refund", "Refund"),
        ("document", "Document"),
        ("system", "System"),
    ]

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_actions",
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=20, choices=ENTITY_CHOICES)
    entity_id = models.CharField(max_length=64, blank=True, default="")
    summary = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"], name="audit_entity_idx"),
            models.Index(fields=["action", "-created_at"], name="audit_action_idx"),
        ]

    def __str__(self):
        return f"{self.action} — {self.summary}"


class FraudFlag(models.Model):
    """Suspicious activity flags for admin review."""

    REASON_CHOICES = [
        ("excessive_cancellations", "Too Many Cancelled Orders"),
        ("repeated_refunds", "Repeated Refund Requests"),
        ("fake_location", "Fake Location Movement"),
        ("failed_payments", "Multiple Failed Payments"),
        ("early_delivery", "Courier Marked Delivered Too Early"),
        ("other", "Other"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("reviewed", "Reviewed"),
        ("dismissed", "Dismissed"),
        ("action_taken", "Action Taken"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fraud_flags",
    )
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    severity = models.CharField(max_length=20, default="medium")
    description = models.TextField(blank=True, default="")
    related_delivery = models.ForeignKey(
        "deliveries.Delivery",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fraud_flags",
    )
    related_payment = models.ForeignKey(
        "payments.PaymentRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fraud_flags",
    )
    metadata = models.JSONField(default=dict, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_fraud_flags",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="fraud_status_idx"),
            models.Index(fields=["user", "-created_at"], name="fraud_user_idx"),
        ]

    def __str__(self):
        return f"Fraud: {self.get_reason_display()} — {self.user_id}"


class DeliveryVerificationEvent(models.Model):
    """PIN attempts, proof uploads, and delivery security events."""

    EVENT_CHOICES = [
        ("pickup_pin_success", "Pickup PIN Success"),
        ("pickup_pin_fail", "Pickup PIN Fail"),
        ("dropoff_code_success", "Dropoff Code Success"),
        ("dropoff_code_fail", "Dropoff Code Fail"),
        ("proof_uploaded", "Proof of Delivery Uploaded"),
        ("signature_uploaded", "Recipient Signature Uploaded"),
        ("pickup_confirmed", "Pickup Confirmed by Customer"),
    ]

    delivery = models.ForeignKey(
        "deliveries.Delivery",
        on_delete=models.CASCADE,
        related_name="verification_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_verification_events",
    )
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    success = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["delivery", "-created_at"],
                name="delivery_verify_evt_idx",
            ),
        ]


class MerchantDocumentReview(models.Model):
    """Per-document admin review state for merchant verification."""

    REVIEW_STATUS = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    merchant = models.OneToOneField(
        "merchants.Merchant",
        on_delete=models.CASCADE,
        related_name="document_review",
    )
    business_license_status = models.CharField(
        max_length=20, choices=REVIEW_STATUS, default="pending"
    )
    owner_id_status = models.CharField(
        max_length=20, choices=REVIEW_STATUS, default="pending"
    )
    logo_status = models.CharField(
        max_length=20, choices=REVIEW_STATUS, default="pending"
    )
    store_photo_status = models.CharField(
        max_length=20, choices=REVIEW_STATUS, default="pending"
    )
    business_license_notes = models.TextField(blank=True, default="")
    owner_id_notes = models.TextField(blank=True, default="")
    logo_notes = models.TextField(blank=True, default="")
    store_photo_notes = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def all_approved(self) -> bool:
        return all(
            status == "approved"
            for status in (
                self.business_license_status,
                self.owner_id_status,
                self.logo_status,
                self.store_photo_status,
            )
        )
