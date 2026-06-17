from django.conf import settings
from django.db import models


class BusinessAccount(models.Model):
    """Company account for bulk deliveries with invoicing."""

    PAYMENT_TERMS_CHOICES = [
        ("prepaid", "Prepaid"),
        ("monthly", "Monthly Invoice"),
    ]

    company_name = models.CharField(max_length=200)
    tax_id = models.CharField(max_length=50, blank=True, default="")
    billing_address = models.TextField()
    contact_person = models.CharField(max_length=120)
    contact_phone = models.CharField(max_length=30)
    contact_email = models.EmailField()
    payment_terms = models.CharField(
        max_length=20, choices=PAYMENT_TERMS_CHOICES, default="prepaid"
    )
    discount_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=10
    )
    daily_limit = models.PositiveIntegerField(default=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.company_name


class Delivery(models.Model):
    STATUS_CHOICES = [
        ("requested", "Requested"),
        ("accepted", "Accepted"),
        ("picked_up", "Picked Up"),
        ("delivering", "Delivering"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    PACKAGE_TYPES = [
        ("document", "Document"),
        ("small", "Small Package"),
        ("medium", "Medium Package"),
        ("large", "Large Package"),
    ]

    SERVICE_CATEGORY_CHOICES = [
        ("food", "Food Delivery"),
        ("package", "Package Delivery"),
        ("document", "Document Delivery"),
        ("pharmacy", "Pharmacy Delivery"),
        ("shopping", "Shopping Delivery"),
    ]

    # ── Core fields (existing) ────────────────────────────────────────────────
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_deliveries",
    )
    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="driver_deliveries",
    )
    pickup = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    pickup_lat = models.FloatField(default=18.0735)
    pickup_lng = models.FloatField(default=-15.9582)
    destination_lat = models.FloatField(default=18.0896)
    destination_lng = models.FloatField(default=-15.9754)
    recipient_name = models.CharField(max_length=120)
    recipient_phone = models.CharField(max_length=30)
    package_type = models.CharField(
        max_length=20, choices=PACKAGE_TYPES, default="small"
    )
    package_description = models.TextField(blank=True, default="")
    package_photo = models.ImageField(
        upload_to="deliveries/packages/", null=True, blank=True
    )
    proof_of_delivery = models.ImageField(
        upload_to="deliveries/proof/", null=True, blank=True
    )
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="requested"
    )
    recipient_code_hash = models.CharField(max_length=255)
    customer_notes = models.TextField(blank=True, default="")
    driver_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    # ── New: Service category ─────────────────────────────────────────────────
    service_category = models.CharField(
        max_length=20,
        choices=SERVICE_CATEGORY_CHOICES,
        default="package",
    )

    # ── New: Package handling ─────────────────────────────────────────────────
    is_fragile = models.BooleanField(default=False)
    weight_kg = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )

    # ── New: Scheduling ───────────────────────────────────────────────────────
    scheduled_pickup_at = models.DateTimeField(null=True, blank=True)
    is_scheduled = models.BooleanField(default=False)

    # ── New: Business account ─────────────────────────────────────────────────
    business_account = models.ForeignKey(
        BusinessAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
    )

    # ── New: Category-specific fields ─────────────────────────────────────────
    # Food delivery
    restaurant_name = models.CharField(max_length=150, blank=True, default="")
    preparation_time_minutes = models.PositiveIntegerField(null=True, blank=True)

    # Pharmacy delivery
    prescription_reference = models.CharField(max_length=100, blank=True, default="")
    is_temperature_sensitive = models.BooleanField(default=False)

    # Shopping delivery
    shopping_list = models.TextField(blank=True, default="")
    max_budget_mru = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    # ── New: Proof of delivery (signature) ────────────────────────────────────
    recipient_signature = models.ImageField(
        upload_to="deliveries/signatures/", null=True, blank=True
    )

    # ── New: Pricing breakdown ────────────────────────────────────────────────
    base_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    distance_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    category_surcharge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )
    extra_stop_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    express_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fragile_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    driver_earning = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_commission = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "-created_at"], name="delivery_status_created_idx"
            ),
            models.Index(
                fields=["customer", "status"], name="delivery_customer_status_idx"
            ),
            models.Index(
                fields=["driver", "status"], name="delivery_driver_status_idx"
            ),
            models.Index(
                fields=["service_category", "status"],
                name="delivery_category_status_idx",
            ),
            models.Index(
                fields=["is_scheduled", "scheduled_pickup_at"],
                name="delivery_scheduled_idx",
            ),
        ]

    def __str__(self):
        return f"Delivery #{self.id} - {self.pickup} to {self.destination}"


class DeliveryStop(models.Model):
    """Individual stop in a multi-stop delivery."""

    STOP_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("arrived", "Arrived"),
        ("delivered", "Delivered"),
    ]

    delivery = models.ForeignKey(
        Delivery, on_delete=models.CASCADE, related_name="stops"
    )
    stop_order = models.PositiveIntegerField()
    address = models.CharField(max_length=255)
    latitude = models.FloatField()
    longitude = models.FloatField()
    recipient_name = models.CharField(max_length=120)
    recipient_phone = models.CharField(max_length=30)
    recipient_code_hash = models.CharField(max_length=255)
    package_description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20, choices=STOP_STATUS_CHOICES, default="pending"
    )
    arrived_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    proof_photo = models.ImageField(
        upload_to="deliveries/stop_proofs/", null=True, blank=True
    )

    class Meta:
        ordering = ["stop_order"]
        unique_together = [("delivery", "stop_order")]
        indexes = [
            models.Index(
                fields=["delivery", "status"], name="stop_delivery_status_idx"
            ),
        ]

    def __str__(self):
        return f"Stop #{self.stop_order} - {self.address} ({self.status})"


class DeliveryDispute(models.Model):
    """Dispute raised by a rider about a completed delivery."""

    REASON_CHOICES = [
        ("damaged", "Package Damaged"),
        ("lost", "Package Lost"),
        ("late", "Delivery Too Late"),
        ("wrong_item", "Wrong Item Delivered"),
        ("other", "Other"),
    ]

    RESOLUTION_CHOICES = [
        ("refund_full", "Full Refund"),
        ("refund_partial", "Partial Refund"),
        ("reject", "Dispute Rejected"),
        ("warn_driver", "Driver Warning Issued"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_review", "In Review"),
        ("resolved", "Resolved"),
    ]

    delivery = models.ForeignKey(
        Delivery, on_delete=models.CASCADE, related_name="disputes"
    )
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_disputes",
    )
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    description = models.TextField(max_length=500)
    photo_evidence = models.ImageField(
        upload_to="deliveries/disputes/", null=True, blank=True
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="open"
    )
    resolution = models.CharField(
        max_length=20, choices=RESOLUTION_CHOICES, null=True, blank=True
    )
    resolution_notes = models.TextField(blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_delivery_disputes",
    )
    refund_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "-created_at"], name="dispute_status_created_idx"
            ),
        ]

    def __str__(self):
        return f"Dispute #{self.id} - {self.get_reason_display()} ({self.status})"


class DriverDeliverySettings(models.Model):
    """Per-driver delivery preferences and stats."""

    MAX_PACKAGE_SIZE_CHOICES = [
        ("document", "Document only"),
        ("small", "Up to Small"),
        ("medium", "Up to Medium"),
        ("large", "All sizes"),
    ]

    driver = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_settings",
    )
    delivery_mode_enabled = models.BooleanField(default=False)
    max_package_size = models.CharField(
        max_length=20, choices=MAX_PACKAGE_SIZE_CHOICES, default="large"
    )
    accepts_food = models.BooleanField(default=True)
    accepts_pharmacy = models.BooleanField(default=True)
    accepts_fragile = models.BooleanField(default=True)
    total_deliveries_completed = models.PositiveIntegerField(default=0)
    average_delivery_time_minutes = models.PositiveIntegerField(default=0)
    delivery_rating = models.DecimalField(
        max_digits=3, decimal_places=1, default=5.0
    )

    class Meta:
        indexes = [
            models.Index(
                fields=["delivery_mode_enabled"], name="driver_delivery_mode_idx"
            ),
        ]

    def __str__(self):
        return f"Delivery settings for {self.driver}"
