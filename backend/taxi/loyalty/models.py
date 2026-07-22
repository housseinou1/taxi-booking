from django.conf import settings
from django.db import models


class LoyaltyTier(models.Model):
    TIER_CHOICES = [
        ("bronze", "Bronze"),
        ("silver", "Silver"),
        ("gold", "Gold"),
        ("platinum", "Platinum"),
    ]

    slug = models.CharField(max_length=20, choices=TIER_CHOICES, unique=True)
    name = models.CharField(max_length=40)
    min_points = models.PositiveIntegerField(default=0)
    ride_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    delivery_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    priority_support = models.BooleanField(default=False)
    exclusive_promotions = models.BooleanField(default=False)
    benefits = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "min_points"]

    def __str__(self):
        return self.name


class RiderLoyaltyAccount(models.Model):
    rider = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="loyalty_account",
    )
    points_balance = models.PositiveIntegerField(default=0)
    lifetime_points = models.PositiveIntegerField(default=0)
    tier = models.ForeignKey(
        LoyaltyTier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Loyalty {self.rider_id} — {self.points_balance} pts"


class LoyaltyPointTransaction(models.Model):
    SOURCE_CHOICES = [
        ("ride", "Completed Ride"),
        ("delivery", "Completed Delivery"),
        ("merchant_order", "Merchant Purchase"),
        ("referral", "Referral"),
        ("promo", "Promotion"),
        ("redemption", "Redemption"),
        ("adjustment", "Admin Adjustment"),
    ]

    account = models.ForeignKey(
        RiderLoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    points = models.IntegerField()
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    reference = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        sign = "+" if self.points >= 0 else ""
        return f"{sign}{self.points} ({self.source})"


class LoyaltyReward(models.Model):
    REWARD_TYPE_CHOICES = [
        ("wallet_credit", "Wallet Credit"),
        ("free_ride_coupon", "Free Ride Coupon"),
        ("delivery_discount", "Delivery Discount"),
        ("ride_discount", "Ride Discount"),
    ]

    name = models.CharField(max_length=120)
    reward_type = models.CharField(max_length=30, choices=REWARD_TYPE_CHOICES)
    points_cost = models.PositiveIntegerField()
    value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    min_tier = models.ForeignKey(
        LoyaltyTier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rewards",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["points_cost"]

    def __str__(self):
        return self.name
