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

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    def __str__(self):
        return self.email

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
