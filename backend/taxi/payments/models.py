from decimal import Decimal

from django.db import models
from django.contrib.auth import get_user_model

from taxi.rides.models import Ride


User = get_user_model()


class Payment(models.Model):
    PAYMENT_STATUS = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    PAYMENT_METHODS = [
        ("card", "Card"),
        ("cash", "Cash"),
        ("wallet", "Wallet"),
    ]

    ride = models.OneToOneField(
        Ride,
        on_delete=models.CASCADE,
        related_name="payment",
    )

    rider = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payments_made",
    )

    driver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payments_received",
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )

    platform_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    driver_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHODS,
        default="card",
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS,
        default="pending",
    )

    stripe_payment_intent = models.CharField(
        max_length=255,
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def calculate_split(self):
        amount = Decimal(str(self.amount))

        self.platform_fee = amount * Decimal("0.20")
        self.driver_amount = amount - self.platform_fee

    def save(self, *args, **kwargs):
        self.calculate_split()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment #{self.id} - {self.amount} MRU"