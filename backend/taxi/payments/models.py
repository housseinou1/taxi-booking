from django.db import models
from django.conf import settings


class Payment(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    )

    PAYMENT_METHOD_CHOICES = (
        ("cash", "Cash"),
        ("card", "Card"),
        ("wallet", "Wallet"),
        ("test", "Test Payment"),
    )

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="driver_payments",
    )

    ride_id = models.IntegerField(null=True, blank=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    driver_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    currency = models.CharField(max_length=10, default="MRU")

    method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="test",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    transaction_id = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def calculate_split(self):
        self.platform_fee = self.amount * 0.20
        self.driver_amount = self.amount - self.platform_fee

    def save(self, *args, **kwargs):
        self.calculate_split()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment {self.id} - {self.amount} {self.currency} - {self.status}"