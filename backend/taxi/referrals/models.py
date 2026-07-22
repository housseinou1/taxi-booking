from django.conf import settings
from django.db import models


class RiderReferralCode(models.Model):
    """Unique referral code for a rider."""

    rider = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rider_referral_code",
    )
    code = models.CharField(max_length=8, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["code"], name="unique_rider_referral_code"
            )
        ]

    def __str__(self):
        return f"{self.rider} - {self.code}"


class DriverReferralCode(models.Model):
    """Unique referral code for a driver."""

    driver = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_referral_code",
    )
    code = models.CharField(max_length=8, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.driver} - {self.code}"


class RiderReferral(models.Model):
    """Records a rider-to-rider referral relationship."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("revoked", "Revoked"),
        ("flagged", "Flagged"),
    ]

    referral_code = models.ForeignKey(
        RiderReferralCode,
        on_delete=models.CASCADE,
        related_name="referrals",
    )
    referee = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rider_referral_as_referee",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    device_id = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["device_id", "created_at"]),
        ]

    def __str__(self):
        return f"Referral: {self.referral_code.rider} -> {self.referee}"


class DriverReferral(models.Model):
    """Records a driver-to-driver referral relationship."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("expired", "Expired"),
    ]

    referral_code = models.ForeignKey(
        DriverReferralCode,
        on_delete=models.CASCADE,
        related_name="referrals",
    )
    referee = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_referral_as_referee",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    ride_threshold = models.PositiveIntegerField()
    completed_rides = models.PositiveIntegerField(default=0)
    last_ride_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expired_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"DriverReferral: {self.referral_code.driver} -> {self.referee}"


class RideCredit(models.Model):
    """Referral credit for a rider, with expiration support."""

    STATUS_CHOICES = [
        ("active", "Active"),
        ("used", "Used"),
        ("expired", "Expired"),
        ("revoked", "Revoked"),
        ("withheld", "Withheld"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ride_credits",
    )
    referral = models.ForeignKey(
        RiderReferral,
        on_delete=models.CASCADE,
        related_name="credits",
    )
    original_amount = models.DecimalField(max_digits=10, decimal_places=2)
    remaining_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="active"
    )
    credit_type = models.CharField(
        max_length=20,
        choices=[("referrer", "Referrer"), ("referee", "Referee")],
    )
    expires_at = models.DateTimeField()
    reminder_sent = models.BooleanField(default=False)
    issued_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["rider", "status"]),
            models.Index(fields=["expires_at", "status"]),
        ]

    def __str__(self):
        return f"Credit {self.original_amount} for {self.rider} ({self.status})"


class DriverBonus(models.Model):
    """Bonus payment for driver referral."""

    STATUS_CHOICES = [
        ("issued", "Issued"),
        ("withheld", "Withheld"),
        ("released", "Released"),
        ("revoked", "Revoked"),
    ]

    referral = models.OneToOneField(
        DriverReferral,
        on_delete=models.CASCADE,
        related_name="bonus",
    )
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_referral_bonuses",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="issued"
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Bonus {self.amount} for {self.referrer} ({self.status})"


class RewardConfiguration(models.Model):
    """Admin-configurable referral reward parameters. Only one active at a time."""

    rider_referrer_credit = models.DecimalField(
        max_digits=10, decimal_places=2, default=50.00
    )
    rider_referee_credit = models.DecimalField(
        max_digits=10, decimal_places=2, default=50.00
    )
    driver_bonus_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=500.00
    )
    driver_ride_threshold = models.PositiveIntegerField(default=20)
    rider_credit_cap_count = models.PositiveIntegerField(default=10)
    rider_credit_cap_days = models.PositiveIntegerField(default=30)
    driver_bonus_cap_count = models.PositiveIntegerField(default=5)
    driver_bonus_cap_days = models.PositiveIntegerField(default=30)
    credit_expiration_days = models.PositiveIntegerField(default=90)
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"RewardConfig (active={self.is_active}, updated={self.updated_at})"


class FlaggedReferral(models.Model):
    """Fraud-flagged referral awaiting admin review."""

    FLAG_REASONS = [
        ("device_abuse", "Multiple signups from same device"),
        ("velocity_abuse", "Exceeds daily credit threshold"),
        ("ghost_account", "No activity after qualifying ride"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("escalated", "Escalated"),
    ]

    rider_referral = models.ForeignKey(
        RiderReferral,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="flags",
    )
    driver_referral = models.ForeignKey(
        DriverReferral,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="flags",
    )
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="flagged_as_referrer",
    )
    referee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="flagged_as_referee",
    )
    reason = models.CharField(max_length=30, choices=FLAG_REASONS)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    flagged_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_flags",
    )
    escalated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "flagged_at"]),
        ]

    def __str__(self):
        return f"FlaggedReferral: {self.reason} ({self.status})"


class MerchantReferralCode(models.Model):
    merchant = models.OneToOneField(
        "merchants.Merchant",
        on_delete=models.CASCADE,
        related_name="referral_code_record",
    )
    code = models.CharField(max_length=8, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.merchant.business_name} — {self.code}"


class MerchantReferral(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("expired", "Expired"),
        ("revoked", "Revoked"),
    ]
    REWARD_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("issued", "Issued"),
        ("expired", "Expired"),
    ]

    referral_code = models.ForeignKey(
        MerchantReferralCode,
        on_delete=models.CASCADE,
        related_name="referrals",
    )
    referred_merchant = models.OneToOneField(
        "merchants.Merchant",
        on_delete=models.CASCADE,
        related_name="merchant_referral_as_referee",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    reward_status = models.CharField(max_length=20, choices=REWARD_STATUS_CHOICES, default="pending")
    reward_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"MerchantReferral {self.referral_code.merchant.business_name} -> {self.referred_merchant.business_name}"
