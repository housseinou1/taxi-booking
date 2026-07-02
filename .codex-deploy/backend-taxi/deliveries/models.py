from django.conf import settings
from django.db import models
import secrets


def default_delivery_cities():
    return ["Nouakchott"]


def default_declined_driver_ids():
    return []


def generate_delivery_pickup_pin():
    return f"{secrets.randbelow(10000):04d}"


def generate_delivery_dropoff_pin():
    return f"{secrets.randbelow(10000):04d}"


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
        ("courier_arriving", "Courier Arriving"),
        ("picked_up", "Picked Up"),
        ("in_transit", "In Transit"),
        ("delivering", "Delivering"),  # legacy alias
        ("delivery_exception", "Delivery Exception"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    EXCEPTION_REASON_CHOICES = [
        ("recipient_unavailable", "Recipient unavailable"),
        ("recipient_forgot_pin", "Recipient forgot PIN"),
        ("recipient_phone_unreachable", "Recipient phone unreachable"),
        ("recipient_refused_pin", "Recipient refused PIN"),
        ("other", "Other"),
    ]

    EXCEPTION_RESOLUTION_CHOICES = [
        ("", "Pending review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("refunded", "Refunded"),
    ]

    PACKAGE_TYPES = [
        ("document", "Document"),
        ("small", "Small Package"),
        ("medium", "Medium Package"),
        ("large", "Large Package"),
        ("extra_large", "Extra Large Package"),
    ]

    SERVICE_CATEGORY_CHOICES = [
        ("food", "Food"),
        ("pharmacy", "Pharmacy / Medicine"),
        ("grocery", "Grocery"),
        ("package", "Parcel"),
        ("documents", "Documents"),
        ("shopping", "Shopping"),
        ("restaurant", "Restaurant Orders"),
        ("market", "Market Delivery"),
        ("household", "Water / Household"),
        ("business", "Business Delivery"),
        ("courier", "Courier"),
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
    service_city = models.CharField(max_length=120, default="Nouakchott")
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
    courier_type_required = models.CharField(max_length=20, default="motorcycle")
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
    pickup_instructions = models.JSONField(default=dict, blank=True)
    dropoff_instructions = models.JSONField(default=dict, blank=True)
    recipient_alt_phone = models.CharField(max_length=30, blank=True, default="")
    driver_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    courier_arriving_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    in_transit_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    exception_reason = models.CharField(
        max_length=40,
        choices=EXCEPTION_REASON_CHOICES,
        blank=True,
        default="",
    )
    exception_note = models.TextField(blank=True, default="")
    exception_reported_at = models.DateTimeField(null=True, blank=True)
    exception_resolution = models.CharField(
        max_length=20,
        choices=EXCEPTION_RESOLUTION_CHOICES,
        blank=True,
        default="",
    )
    exception_resolved_at = models.DateTimeField(null=True, blank=True)
    exception_resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_delivery_exceptions",
    )

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
    food_items = models.TextField(blank=True, default="")
    preparation_time_minutes = models.PositiveIntegerField(null=True, blank=True)

    # Pharmacy delivery
    pharmacy_name = models.CharField(max_length=150, blank=True, default="")
    prescription_reference = models.CharField(max_length=100, blank=True, default="")
    prescription_photo = models.ImageField(
        upload_to="deliveries/prescriptions/", null=True, blank=True
    )
    is_urgent = models.BooleanField(default=False)
    is_temperature_sensitive = models.BooleanField(default=False)

    # Grocery / market / shopping
    store_name = models.CharField(max_length=150, blank=True, default="")
    shopping_list = models.TextField(blank=True, default="")
    item_quantity = models.CharField(max_length=255, blank=True, default="")
    substitution_notes = models.TextField(blank=True, default="")

    # Documents
    is_secure_delivery = models.BooleanField(default=False)
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
    package_size_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    surge_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    night_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    waiting_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    heavy_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    courier_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=1.2)
    promo_code = models.CharField(max_length=30, blank=True, default="")
    pricing_snapshot = models.JSONField(default=dict, blank=True)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    driver_earning = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_commission = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )

    # ── Assignment / lifecycle ────────────────────────────────────────────────
    pickup_pin = models.CharField(
        max_length=4,
        default=generate_delivery_pickup_pin,
        help_text="PIN shown to customer for pickup verification.",
    )
    pickup_pin_verified_at = models.DateTimeField(null=True, blank=True)
    dropoff_pin = models.CharField(
        max_length=4,
        default=generate_delivery_dropoff_pin,
        help_text="PIN sent to recipient for delivery confirmation.",
    )
    dropoff_pin_verified_at = models.DateTimeField(null=True, blank=True)
    offered_driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offered_deliveries",
    )
    offer_sent_at = models.DateTimeField(null=True, blank=True)
    declined_driver_ids = models.JSONField(default=default_declined_driver_ids, blank=True)
    assignment_round = models.PositiveIntegerField(default=0)
    estimated_duration_minutes = models.PositiveIntegerField(null=True, blank=True)

    PAYMENT_METHOD_CHOICES = [
        ("cash", "Cash"),
        ("card", "Card"),
        ("wallet", "Yala Wallet"),
    ]
    PAYMENT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("failed", "Failed"),
    ]

    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, default="cash"
    )
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS_CHOICES, default="pending"
    )
    tip_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    customer_rating = models.PositiveSmallIntegerField(null=True, blank=True)
    customer_review = models.TextField(blank=True, default="")
    rated_at = models.DateTimeField(null=True, blank=True)
    near_pickup_notified = models.BooleanField(default=False)
    near_dropoff_notified = models.BooleanField(default=False)

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

    DELIVERY_VEHICLE_CHOICES = [
        ("bicycle", "Bicycle"),
        ("motorcycle", "Motorcycle"),
        ("car", "Car"),
    ]

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
    delivery_cities = models.JSONField(default=default_delivery_cities, blank=True)
    delivery_vehicle_type = models.CharField(
        max_length=20,
        choices=DELIVERY_VEHICLE_CHOICES,
        default="motorcycle",
    )
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
    is_suspended = models.BooleanField(default=False)
    suspension_reason = models.TextField(blank=True, default="")
    chat_warnings = models.PositiveIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(
                fields=["delivery_mode_enabled"], name="driver_delivery_mode_idx"
            ),
        ]

    def __str__(self):
        return f"Delivery settings for {self.driver}"


class DeliveryChatMessage(models.Model):
    """Template chat messages between customer and courier during a delivery."""

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_chat_messages",
    )
    template_key = models.CharField(max_length=50, blank=True, default="")
    text = models.TextField()
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["delivery", "created_at"], name="delivery_chat_time_idx"),
        ]

    def __str__(self):
        return f"Delivery #{self.delivery_id} chat: {self.text[:40]}"


class DeliveryMessage(models.Model):
    """Free-text and image messages between customer and courier during an active delivery."""

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_messages",
    )
    message = models.TextField(max_length=500, blank=True, default="")
    image = models.ImageField(upload_to="deliveries/chat/", null=True, blank=True)
    is_read = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)
    hidden_reason = models.TextField(blank=True, default="")
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hidden_delivery_messages",
    )
    report_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["delivery", "created_at"], name="delivery_msg_time_idx"),
            models.Index(fields=["delivery", "is_read"], name="delivery_msg_read_idx"),
        ]

    def __str__(self):
        preview = self.message[:40] if self.message else "[image]"
        return f"Delivery #{self.delivery_id} message: {preview}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if not (self.message or "").strip() and not self.image:
            raise ValidationError("Message must include text or an image.")


class DeliveryChatReport(models.Model):
    """Safety or abuse report filed against delivery chat."""

    REASON_CHOICES = [
        ("harassment", "Harassment"),
        ("inappropriate_message", "Inappropriate message"),
        ("wrong_address", "Wrong address"),
        ("unsafe_situation", "Unsafe situation"),
        ("fraud_attempt", "Fraud attempt"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("reviewed", "Reviewed"),
        ("dismissed", "Dismissed"),
    ]

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name="chat_reports",
    )
    message = models.ForeignKey(
        DeliveryMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    dispute = models.ForeignKey(
        DeliveryDispute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_reports",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_chat_reports_filed",
    )
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_chat_reports_received",
    )
    reason = models.CharField(max_length=40, choices=REASON_CHOICES)
    details = models.TextField(blank=True, default="", max_length=1000)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_chat_reports_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="delivery_chat_rpt_idx"),
            models.Index(fields=["delivery", "-created_at"], name="delivery_chat_rpt_del_idx"),
        ]

    def __str__(self):
        return f"Chat report #{self.id} · delivery #{self.delivery_id}"


class DeliveryCallSession(models.Model):
    """Short-lived masked call session for customer ↔ courier contact."""

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name="call_sessions",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_call_sessions_as_customer",
    )
    courier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="delivery_call_sessions_as_courier",
    )
    session_code = models.CharField(max_length=12, unique=True)
    dial_number = models.CharField(max_length=30)
    is_masked = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Call session {self.session_code} for delivery #{self.delivery_id}"
