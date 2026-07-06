from django.conf import settings
from django.db import models
from django.utils import timezone


def _check_constraint(name, predicate):
    """
    Compatibility helper for Django versions that use either
    CheckConstraint(condition=...) or CheckConstraint(check=...).
    """
    try:
        return models.CheckConstraint(condition=predicate, name=name)
    except TypeError:
        return models.CheckConstraint(check=predicate, name=name)


class DriverProfile(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("pending_review", "Pending Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    CAR_TYPE_CHOICES = [
        ("regular", "Regular"),
        ("xl", "XL"),
        ("comfort", "Comfort"),
        ("share", "Share"),
    ]

    DRIVER_CATEGORY_CHOICES = [
        ("gold", "Gold"),
        ("platinum", "Platinum"),
        ("diamond", "Diamond"),
        ("elite", "Elite"),
    ]

    DRIVER_LEVEL_CHOICES = [
        ("bronze", "Bronze"),
        ("silver", "Silver"),
        ("gold", "Gold"),
        ("platinum", "Platinum"),
        ("elite", "Elite"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_profile",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )
    application_rejection_reason = models.TextField(blank=True, default="")

    is_available = models.BooleanField(default=False)

    # --- Driver identification ---
    driver_code = models.CharField(
        max_length=6,
        unique=True,
        null=True,
        blank=True,
    )

    phone_number = models.CharField(
        max_length=30,
        blank=True,
        null=True,
    )

    car_type = models.CharField(
        max_length=20,
        choices=CAR_TYPE_CHOICES,
        default="regular",
        blank=True,
        null=True,
    )

    driver_category = models.CharField(
        max_length=20,
        choices=DRIVER_CATEGORY_CHOICES,
        default="gold",
    )

    # --- Driver Level System fields ---
    driver_level = models.CharField(
        max_length=20,
        choices=DRIVER_LEVEL_CHOICES,
        default="bronze",
    )

    # Performance metrics (cached for quick access)
    total_rides_completed = models.IntegerField(default=0)
    total_rides_accepted = models.IntegerField(default=0)
    total_rides_received = models.IntegerField(default=0)
    total_rides_cancelled = models.IntegerField(default=0)
    total_rides_missed = models.IntegerField(default=0)
    total_rides_declined = models.IntegerField(default=0)
    performance_points = models.IntegerField(default=100)
    acceptance_rate_points = models.IntegerField(default=100)
    cancellations_today_count = models.IntegerField(default=0)
    cancellations_today_date = models.DateField(null=True, blank=True)
    account_risk_flag = models.BooleanField(default=False)
    account_under_review = models.BooleanField(default=False)
    account_risk_reason = models.TextField(blank=True, default="")
    average_rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=0.00
    )

    # Level demotion tracking
    below_threshold_since = models.DateTimeField(null=True, blank=True)
    demotion_warning_sent = models.BooleanField(default=False)

    # Rewards
    reward_points = models.IntegerField(default=0)

    # --- Vehicle details ---
    vehicle_make = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_model = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_color = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    vehicle_plate = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    plate_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
    )

    driver_photo = models.ImageField(
        upload_to="drivers/photos/",
        blank=True,
        null=True,
    )

    vehicle_photo = models.ImageField(
        upload_to="drivers/vehicles/",
        blank=True,
        null=True,
    )

    license_file = models.FileField(
        upload_to="drivers/licenses/",
        blank=True,
        null=True,
    )

    license_issued_at = models.DateField(
        blank=True,
        null=True,
    )

    license_expires_at = models.DateField(
        blank=True,
        null=True,
    )

    vehicle_registration = models.FileField(
        upload_to="drivers/registrations/",
        blank=True,
        null=True,
    )

    vehicle_registration_expires_at = models.DateField(
        blank=True,
        null=True,
    )

    insurance_document = models.FileField(
        upload_to="drivers/insurance/",
        blank=True,
        null=True,
    )

    insurance_expires_at = models.DateField(
        blank=True,
        null=True,
    )

    vignette_document = models.FileField(
        upload_to="drivers/vignettes/",
        blank=True,
        null=True,
    )

    vignette_expires_at = models.DateField(
        blank=True,
        null=True,
    )

    # --- Document verification status ---
    DOCUMENT_STATUS_CHOICES = [
        ("pending", "Pending Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("expired", "Expired"),
    ]

    license_status = models.CharField(
        max_length=20, choices=DOCUMENT_STATUS_CHOICES, default="pending"
    )
    license_rejection_note = models.TextField(blank=True, default="")

    insurance_status = models.CharField(
        max_length=20, choices=DOCUMENT_STATUS_CHOICES, default="pending"
    )
    insurance_rejection_note = models.TextField(blank=True, default="")

    vignette_status = models.CharField(
        max_length=20, choices=DOCUMENT_STATUS_CHOICES, default="pending"
    )
    vignette_rejection_note = models.TextField(blank=True, default="")

    registration_status = models.CharField(
        max_length=20, choices=DOCUMENT_STATUS_CHOICES, default="pending"
    )
    registration_rejection_note = models.TextField(blank=True, default="")

    photo_status = models.CharField(
        max_length=20, choices=DOCUMENT_STATUS_CHOICES, default="pending"
    )
    photo_rejection_note = models.TextField(blank=True, default="")

    terms_accepted = models.BooleanField(default=False)

    terms_accepted_at = models.DateTimeField(
        blank=True,
        null=True,
    )

    terms_version = models.CharField(
        max_length=30,
        blank=True,
        default="",
    )

    signature_image = models.ImageField(
        upload_to="legal/courier_signatures/",
        null=True,
        blank=True,
    )
    signed_full_name = models.CharField(max_length=200, blank=True, default="")
    signed_ip_address = models.GenericIPAddressField(null=True, blank=True)
    signed_device_info = models.TextField(blank=True, default="")
    signed_app_version = models.CharField(max_length=40, blank=True, default="")
    legal_declaration_accepted = models.BooleanField(default=False)
    terms_scrolled_to_bottom = models.BooleanField(default=False)

    # --- Taxi driver agreement e-signature (separate from Delivery courier terms) ---
    driver_terms_accepted = models.BooleanField(default=False)
    driver_terms_accepted_at = models.DateTimeField(blank=True, null=True)
    driver_terms_version = models.CharField(max_length=30, blank=True, default="")
    driver_signed_full_name = models.CharField(max_length=200, blank=True, default="")
    driver_signature_image = models.ImageField(
        upload_to="legal/driver_signatures/",
        null=True,
        blank=True,
    )
    driver_signed_ip_address = models.GenericIPAddressField(null=True, blank=True)
    driver_signed_device_info = models.TextField(blank=True, default="")
    driver_signed_app_version = models.CharField(max_length=40, blank=True, default="")
    driver_legal_declaration_accepted = models.BooleanField(default=False)
    driver_terms_scrolled_to_bottom = models.BooleanField(default=False)

    current_lat = models.FloatField(
        blank=True,
        null=True,
        default=18.0735,
    )

    current_lng = models.FloatField(
        blank=True,
        null=True,
        default=-15.9582,
    )

    driver_lat = models.FloatField(
        blank=True,
        null=True,
        default=18.0735,
    )

    driver_lng = models.FloatField(
        blank=True,
        null=True,
        default=-15.9582,
    )

    # --- QR Code Verification fields ---
    qr_code_uuid = models.CharField(
        max_length=36,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )

    qr_code_image = models.FileField(
        upload_to="drivers/qr_codes/",
        null=True,
        blank=True,
    )

    qr_code_generated_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    def save(self, *args, **kwargs):
        if self.vehicle_plate and not self.plate_number:
            self.plate_number = self.vehicle_plate

        if self.plate_number and not self.vehicle_plate:
            self.vehicle_plate = self.plate_number

        if self.terms_accepted and not self.terms_accepted_at:
            self.terms_accepted_at = timezone.now()

        if self.driver_terms_accepted and not self.driver_terms_accepted_at:
            self.driver_terms_accepted_at = timezone.now()

        if self.status == "approved" and not self.driver_code:
            from taxi.drivers.driver_code import ensure_driver_code

            ensure_driver_code(self)

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.email} Driver Profile"


class DriverDocument(models.Model):
    DOCUMENT_TYPES = [
        ("license", "Driver License"),
        ("national_id", "National ID"),
        ("insurance", "Insurance"),
        ("carte_grise", "Carte Grise"),
        ("vignette", "Vignette"),
        ("vehicle_registration", "Vehicle Registration (Legacy)"),
        ("plate_number_photo", "Plate Number Photo"),
        ("profile_photo", "Profile Photo"),
    ]

    STATUS_CHOICES = [
        ("pending_review", "Pending Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPES)
    file = models.FileField(upload_to="driver/documents/")
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending_review"
    )
    rejection_reason = models.TextField(blank=True, default="")
    issued_at = models.DateField(null=True, blank=True)
    expires_at = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_documents",
    )

    def __str__(self):
        return f"{self.driver} - {self.get_document_type_display()}"


class Achievement(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField()
    icon = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class DriverAchievement(models.Model):
    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="achievements",
    )
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE)
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["driver", "achievement"]

    def __str__(self):
        return f"{self.driver} - {self.achievement.name}"


class HallOfFameRecognition(models.Model):
    CATEGORY_CHOICES = [
        ("driver_of_month", "Driver of the Month"),
        ("top_city", "Top Driver by City"),
        ("top_national", "Top Driver in Mauritania"),
        ("lifetime_milestone", "Lifetime Milestone"),
    ]
    BADGE_CHOICES = [
        ("gold", "Gold Hall of Fame"),
        ("silver", "Silver Hall of Fame"),
        ("bronze", "Bronze Hall of Fame"),
    ]

    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="hall_of_fame_recognitions",
    )
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    badge = models.CharField(max_length=20, choices=BADGE_CHOICES)
    title = models.CharField(max_length=160)
    city = models.ForeignKey(
        "locations.City",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hall_of_fame_recognitions",
    )
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField(null=True, blank=True)
    rank = models.PositiveSmallIntegerField(default=1)
    lifetime_completed_rides = models.PositiveIntegerField(default=0)
    years_with_yala = models.PositiveIntegerField(default=0)
    performance_score = models.PositiveSmallIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-month", "rank", "driver__user__first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["driver", "category", "title", "year", "month"],
                name="unique_driver_hall_recognition",
            ),
        ]
        indexes = [
            models.Index(fields=["category", "-year", "-month"], name="hof_category_period_idx"),
            models.Index(fields=["city", "-year"], name="hof_city_year_idx"),
        ]

    def __str__(self):
        return f"{self.driver.user.email} - {self.title}"


class DriverFavoriteArea(models.Model):
    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="favorite_areas",
    )
    label = models.CharField(max_length=100)
    center_lat = models.FloatField()
    center_lng = models.FloatField()
    radius_km = models.FloatField(default=3.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            _check_constraint(
                name="positive_radius",
                predicate=models.Q(radius_km__gt=0),
            )
        ]

    def __str__(self):
        return f"{self.driver} - {self.label}"


class DriverSettings(models.Model):
    LANGUAGE_CHOICES = [
        ("en", "English"),
        ("fr", "French"),
        ("ar", "Arabic"),
    ]

    GPS_ACCURACY_CHOICES = [
        ("high", "High Accuracy"),
        ("battery_saver", "Battery Saver"),
    ]

    driver = models.OneToOneField(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="settings",
    )
    language = models.CharField(
        max_length=5, choices=LANGUAGE_CHOICES, default="en"
    )
    notifications_rides = models.BooleanField(default=True)
    notifications_delivery_updates = models.BooleanField(default=True)
    notifications_promotions = models.BooleanField(default=True)
    notifications_system = models.BooleanField(default=True)
    gps_accuracy = models.CharField(
        max_length=20, choices=GPS_ACCURACY_CHOICES, default="high"
    )
    dark_mode = models.BooleanField(default=False)
    pin_lock = models.CharField(max_length=6, blank=True, default="")
    biometric_enabled = models.BooleanField(default=False)
    privacy_show_name = models.BooleanField(default=True)
    privacy_show_photo = models.BooleanField(default=True)
    privacy_show_vehicle = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Driver settings"

    def __str__(self):
        return f"{self.driver} - Settings"


class DriverCompliment(models.Model):
    CATEGORY_CHOICES = [
        ("professionalism", "Professionalism"),
        ("clean_vehicle", "Clean Vehicle"),
        ("safe_driving", "Safe Driving"),
        ("friendliness", "Friendliness"),
        ("punctuality", "Punctuality"),
    ]

    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="compliments",
    )
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.CASCADE,
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.driver} - {self.get_category_display()}"


class SupportTicket(models.Model):
    TICKET_TYPES = [
        ("emergency", "Emergency"),
        ("live_chat", "Live Chat"),
        ("contact_form", "Contact Form"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]

    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="support_tickets",
    )
    ticket_type = models.CharField(max_length=20, choices=TICKET_TYPES)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="open"
    )
    subject = models.CharField(max_length=200, blank=True, default="")
    message = models.TextField(blank=True, default="")
    location_lat = models.FloatField(null=True, blank=True)
    location_lng = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.driver} - {self.get_ticket_type_display()} ({self.status})"


class HeatmapZone(models.Model):
    center_lat = models.FloatField()
    center_lng = models.FloatField()
    radius_km = models.FloatField(default=1.0)
    intensity = models.FloatField(default=0.5)
    active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"HeatmapZone ({self.center_lat}, {self.center_lng}) - intensity: {self.intensity}"


class VerificationRecord(models.Model):
    SCAN_RESULT_CHOICES = [
        ("verified", "Verified"),
        ("inactive_driver", "Inactive Driver"),
        ("invalid_code", "Invalid Code"),
        ("forged_code", "Forged Code"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification_scans",
    )
    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="verification_records",
    )
    scanned_at = models.DateTimeField(auto_now_add=True)
    scan_result = models.CharField(
        max_length=20,
        choices=SCAN_RESULT_CHOICES,
    )

    class Meta:
        ordering = ["-scanned_at"]
        indexes = [
            models.Index(fields=["-scanned_at"]),
            models.Index(fields=["rider", "-scanned_at"]),
            models.Index(fields=["driver", "-scanned_at"]),
        ]

    def __str__(self):
        return f"Verification: {self.rider} scanned {self.driver} - {self.scan_result}"


class QRCodeAuditLog(models.Model):
    ACTION_CHOICES = [
        ("generated", "Generated"),
        ("regenerated", "Regenerated"),
    ]

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="qr_audit_actions",
    )
    driver = models.ForeignKey(
        DriverProfile,
        on_delete=models.CASCADE,
        related_name="qr_audit_logs",
    )
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES,
    )
    old_qr_uuid = models.CharField(
        max_length=36,
        null=True,
        blank=True,
    )
    new_qr_uuid = models.CharField(
        max_length=36,
    )
    performed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"QR Audit: {self.action} for {self.driver} by {self.admin}"
