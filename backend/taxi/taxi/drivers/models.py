from django.conf import settings
from django.db import models
from django.utils import timezone


class DriverProfile(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
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

    def save(self, *args, **kwargs):
        if self.vehicle_plate and not self.plate_number:
            self.plate_number = self.vehicle_plate

        if self.plate_number and not self.vehicle_plate:
            self.vehicle_plate = self.plate_number

        if self.terms_accepted and not self.terms_accepted_at:
            self.terms_accepted_at = timezone.now()

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
            models.CheckConstraint(
                check=models.Q(radius_km__gt=0),
                name="positive_radius",
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
