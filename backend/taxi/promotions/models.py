from django.conf import settings
from django.db import models


class ReferralCode(models.Model):
    rider = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_code",
    )
    code = models.CharField(max_length=20, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ReferralCode({self.code}) for {self.rider}"


class ReferralUsage(models.Model):
    referral_code = models.ForeignKey(
        ReferralCode,
        on_delete=models.CASCADE,
        related_name="usages",
    )
    referee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_as_referee",
    )
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.CASCADE,
        related_name="referral_usages",
    )
    referee_discount = models.DecimalField(max_digits=10, decimal_places=2)
    referrer_credit = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("referral_code", "referee")]

    def __str__(self):
        return f"ReferralUsage({self.referral_code.code} -> {self.referee})"


class ReferrerCredit(models.Model):
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referrer_credits",
    )
    referral_usage = models.OneToOneField(
        ReferralUsage,
        on_delete=models.CASCADE,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_used = models.BooleanField(default=False)
    used_on_ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ReferrerCredit({self.amount}) for {self.referrer}"


class PromoCode(models.Model):
    DISCOUNT_TYPE_CHOICES = [
        ("percentage", "Percentage Off"),
        ("fixed", "Fixed Amount Off"),
        ("free_ride", "Free Ride"),
        ("free_delivery", "Free Delivery"),
    ]

    CAMPAIGN_TYPE_CHOICES = [
        ("general", "General"),
        ("first_ride", "First Ride Offer"),
        ("free_delivery", "Free Delivery"),
        ("city_campaign", "City Campaign"),
        ("loyalty_exclusive", "Loyalty Exclusive"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("inactive", "Inactive"),
    ]

    code = models.CharField(max_length=30, unique=True)  # stored uppercase
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    # For percentage: 1-100; For fixed: positive MRU amount; For free_ride: 0 (ignored)

    start_date = models.DateTimeField()
    end_date = models.DateTimeField()

    max_total_uses = models.PositiveIntegerField(null=True, blank=True)  # null = unlimited
    max_per_rider_uses = models.PositiveIntegerField(null=True, blank=True)  # null = unlimited
    min_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    city = models.ForeignKey(
        "locations.City",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promo_codes",
        help_text="Optional city restriction. Blank means available in every city.",
    )

    first_ride_only = models.BooleanField(default=False)
    campaign_type = models.CharField(
        max_length=30,
        choices=CAMPAIGN_TYPE_CHOICES,
        default="general",
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        self.code = self.code.upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class PromoCodeUsage(models.Model):
    promo_code = models.ForeignKey(
        PromoCode, on_delete=models.CASCADE, related_name="usages"
    )
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="promo_usages"
    )
    ride = models.ForeignKey(
        "rides.Ride", on_delete=models.CASCADE, related_name="promo_usages"
    )

    original_fare = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    final_fare = models.DecimalField(max_digits=10, decimal_places=2)

    is_first_ride = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["promo_code", "ride"],
                name="unique_promo_code_per_ride",
            ),
        ]

    def __str__(self):
        return f"{self.rider} used {self.promo_code} on ride {self.ride_id}"
