from django.conf import settings
from django.db import models


class RiderPaymentMethod(models.Model):
    PAYMENT_TYPES = [
        ("card", "Card"),
        ("bank_account", "Bank Account"),
        ("bankily", "Bankily"),
        ("masrvi", "Masravi"),
        ("seddad", "Seddad"),
        ("cash", "Cash"),
    ]

    CARD_TYPES = [
        ("visa", "Visa"),
        ("mastercard", "Mastercard"),
        ("amex", "American Express"),
        ("none", "None"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_methods",
    )

    payment_type = models.CharField(
        max_length=30,
        choices=PAYMENT_TYPES,
        default="card",
    )

    card_holder_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    card_type = models.CharField(
        max_length=20,
        choices=CARD_TYPES,
        default="none",
    )

    card_last4 = models.CharField(
        max_length=4,
        blank=True,
        default="",
    )

    expiry_month = models.CharField(
        max_length=2,
        blank=True,
        default="",
    )

    expiry_year = models.CharField(
        max_length=4,
        blank=True,
        default="",
    )

    bank_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )

    account_reference = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )

    phone_number = models.CharField(
        max_length=30,
        blank=True,
        default="",
    )

    wallet_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )

    is_default = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.payment_type == "card":
            return f"{self.card_type.upper()} •••• {self.card_last4}"

        if self.payment_type in ["bankily", "masrvi", "seddad"]:
            return f"{self.payment_type.upper()} - {self.phone_number}"

        if self.payment_type == "bank_account":
            return f"{self.bank_name} - {self.account_reference}"

        return self.payment_type.upper()


class Payment(models.Model):
    
    PAYMENT_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("authorized", "Authorized"),
    ("pending_verification", "Pending Verification"),
    ("paid", "Paid"),
    ("failed", "Failed"),
    ("cancelled", "Cancelled"),
    ("refunded", "Refunded"),
]

    PAYMENT_METHOD_CHOICES = [
        ("cash", "Cash"),
        ("card", "Card"),
        ("bank_account", "Bank Account"),
        ("bankily", "Bankily"),
        ("masrvi", "Masravi"),
        ("seddad", "Seddad"),
        ("test", "Test"),
    ]

    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
        null=True,
        blank=True,
    )

    ride_id = models.IntegerField(default=0)

    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    app_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tip_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tip_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    driver_earning = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    currency = models.CharField(max_length=10, default="MRU")

    method = models.CharField(
        max_length=30,
        choices=PAYMENT_METHOD_CHOICES,
        default="test",
    )

    status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default="pending",
    )

    transaction_id = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payment #{self.id} - Ride {self.ride_id}"


class DriverPayoutMethod(models.Model):
    PAYOUT_TYPES = [
        ("bank_account", "Bank Account"),
        ("card", "Card"),
        ("bankily", "Bankily"),
        ("masrvi", "Masravi"),
        ("seddad", "Seddad"),
    ]

    CARD_TYPES = [
        ("visa", "Visa"),
        ("mastercard", "Mastercard"),
        ("none", "None"),
    ]

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="driver_payout_methods",
    )
    payout_type = models.CharField(max_length=30, choices=PAYOUT_TYPES, default="bank_account")
    account_holder_name = models.CharField(max_length=255, blank=True, default="")
    bank_name = models.CharField(max_length=100, blank=True, default="")
    account_reference = models.CharField(max_length=100, blank=True, default="")
    card_type = models.CharField(max_length=20, choices=CARD_TYPES, default="none")
    card_last4 = models.CharField(max_length=4, blank=True, default="")
    phone_number = models.CharField(max_length=30, blank=True, default="")
    wallet_id = models.CharField(max_length=100, blank=True, default="")
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.payout_type == "bank_account":
            return f"{self.bank_name} - {self.account_reference}"
        if self.payout_type == "card":
            return f"{self.card_type.upper()} •••• {self.card_last4}"
        if self.payout_type == "masrvi":
            return f"MASRAVI - {self.phone_number or self.wallet_id}"
        return f"{self.payout_type.upper()} - {self.phone_number or self.wallet_id}"


class OwnerPayoutMethod(models.Model):
    PAYOUT_TYPES = [
        ("bank_account", "Bank Account"),
        ("bankily", "Bankily"),
        ("masrvi", "Masravi"),
        ("seddad", "Seddad"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_payout_methods",
    )
    payout_type = models.CharField(max_length=30, choices=PAYOUT_TYPES, default="bank_account")
    account_holder_name = models.CharField(max_length=255, blank=True, default="")
    bank_name = models.CharField(max_length=100, blank=True, default="")
    account_reference = models.CharField(max_length=100, blank=True, default="")
    phone_number = models.CharField(max_length=30, blank=True, default="")
    wallet_id = models.CharField(max_length=100, blank=True, default="")
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.payout_type == "bank_account":
            return f"{self.bank_name} - {self.account_reference}"
        if self.payout_type == "masrvi":
            return f"MASRAVI - {self.phone_number or self.wallet_id}"
        return f"{self.payout_type.upper()} - {self.phone_number or self.wallet_id}"


class WithdrawalRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="withdrawal_requests",
    )
    payout_method = models.ForeignKey(
        DriverPayoutMethod,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default="MRU")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    note = models.TextField(blank=True, default="")
    admin_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Withdrawal #{self.id} - {self.driver.email} - {self.amount} {self.currency}"
