from django.conf import settings
from django.db import models


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
    package_type = models.CharField(max_length=20, choices=PACKAGE_TYPES, default="small")
    package_description = models.TextField(blank=True, default="")
    package_photo = models.ImageField(upload_to="deliveries/packages/", null=True, blank=True)
    proof_of_delivery = models.ImageField(
        upload_to="deliveries/proof/",
        null=True,
        blank=True,
    )
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="requested")
    recipient_code_hash = models.CharField(max_length=255)
    customer_notes = models.TextField(blank=True, default="")
    driver_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="delivery_status_created_idx"),
            models.Index(fields=["customer", "status"], name="delivery_customer_status_idx"),
            models.Index(fields=["driver", "status"], name="delivery_driver_status_idx"),
        ]

    def __str__(self):
        return f"Delivery #{self.id} - {self.pickup} to {self.destination}"
