from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    USER_TYPES = (
        ("rider", "Rider"),
        ("driver", "Driver"),
    )

    GENDER_CHOICES = (
        ("Male", "Male"),
        ("Female", "Female"),
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

    user_type = models.CharField(
        max_length=20,
        choices=USER_TYPES,
        default="rider",
    )

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

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email
