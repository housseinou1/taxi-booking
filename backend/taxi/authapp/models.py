from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required.")

        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    USER_TYPES = (
        ("rider", "Rider"),
        ("driver", "Driver"),
        ("merchant", "Merchant"),
    )

    GENDER_CHOICES = (
        ("Male", "Male"),
        ("Female", "Female"),
    )

    RIDER_STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    username = None

    email = models.EmailField(unique=True)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)

    gender = models.CharField(
        max_length=20,
        choices=GENDER_CHOICES,
        default="Male",
    )

    phone_number = models.CharField(
        max_length=30,
        blank=True,
        default="",
    )

    city = models.ForeignKey(
        "locations.City",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    user_type = models.CharField(
        max_length=20,
        choices=USER_TYPES,
        default="rider",
    )

    rider_status = models.CharField(
        max_length=20,
        choices=RIDER_STATUS_CHOICES,
        default="approved",
    )

    email_verified = models.BooleanField(default=False)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    rider_rejection_reason = models.TextField(blank=True, default="")

    national_id_number = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
    )

    national_id_document = models.FileField(
        upload_to="users/national_ids/",
        null=True,
        blank=True,
    )

    profile_picture = models.ImageField(
        upload_to="users/profile_pictures/",
        null=True,
        blank=True,
    )

    delivery_terms_accepted = models.BooleanField(default=False)
    delivery_terms_accepted_at = models.DateTimeField(null=True, blank=True)
    delivery_terms_version = models.CharField(max_length=30, blank=True, default="")
    privacy_policy_accepted = models.BooleanField(default=False)
    privacy_policy_accepted_at = models.DateTimeField(null=True, blank=True)
    privacy_policy_version = models.CharField(max_length=30, blank=True, default="")

    ride_terms_accepted = models.BooleanField(default=False)
    ride_terms_accepted_at = models.DateTimeField(null=True, blank=True)
    ride_terms_version = models.CharField(max_length=30, blank=True, default="")

    city = models.ForeignKey(
        "cities.City",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        if self.delivery_terms_accepted and not self.delivery_terms_accepted_at:
            self.delivery_terms_accepted_at = timezone.now()
        if self.privacy_policy_accepted and not self.privacy_policy_accepted_at:
            self.privacy_policy_accepted_at = timezone.now()
        if self.ride_terms_accepted and not self.ride_terms_accepted_at:
            self.ride_terms_accepted_at = timezone.now()
        super().save(*args, **kwargs)

    @property
    def is_phone_verified(self):
        return bool(self.phone_verified_at)


class PhoneVerificationCode(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="phone_verification_codes",
    )
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_active(self):
        return (
            self.consumed_at is None
            and self.expires_at > timezone.now()
            and self.attempts < 5
        )


class DeviceSession(models.Model):
    """Tracks authenticated devices per user for binding and new-device alerts."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="device_sessions",
    )
    device_id = models.CharField(max_length=128, db_index=True)
    device_name = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    is_new_device = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_seen_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "device_id"], name="device_sess_user_device_uniq"
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-last_seen_at"], name="device_sess_user_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} — {self.device_id[:16]}"


class PasswordResetCode(models.Model):
    IDENTIFIER_CHOICES = (
        ("phone", "Phone"),
        ("email", "Email"),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="password_reset_codes",
    )
    identifier_type = models.CharField(max_length=10, choices=IDENTIFIER_CHOICES)
    identifier = models.CharField(max_length=255, db_index=True)
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    requested_ip_address = models.GenericIPAddressField(null=True, blank=True)
    requested_device_info = models.TextField(blank=True, default="")
    reset_ip_address = models.GenericIPAddressField(null=True, blank=True)
    reset_device_info = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["identifier", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    @property
    def is_active(self):
        return (
            self.consumed_at is None
            and self.expires_at > timezone.now()
            and self.attempts < 5
        )
