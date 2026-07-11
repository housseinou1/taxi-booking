from django.conf import settings
from django.core.validators import MinValueValidator
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
        ("wallet", "Yala Wallet"),
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
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, default=0,
        help_text="Promo code discount amount applied to this payment.",
    )
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
    payout_type = models.CharField(max_length=30, choices=PAYOUT_TYPES, default="bankily")
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
        ("paid", "Paid"),
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
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_withdrawals",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paid_withdrawals",
    )
    otp_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["driver", "status"], name="withdrawal_driver_status_idx"),
        ]

    def __str__(self):
        return f"Withdrawal #{self.id} - {self.driver.email} - {self.amount} {self.currency}"


class WithdrawalOTPCode(models.Model):
    """One-time code for confirming driver withdrawal requests."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="withdrawal_otp_codes",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-created_at"], name="withdrawal_otp_user_idx"),
        ]


class WalletAccount(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet_account"
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="MRU")
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)


class WalletTransaction(models.Model):
    TYPE_CHOICES = [
        ("top_up", "Top Up"),
        ("ride_payment", "Ride Payment"),
        ("ride_earning", "Ride Earning"),
        ("tip", "Tip"),
        ("delivery_payment", "Delivery Payment"),
        ("merchant_payment", "Merchant Order Payment"),
        ("courier_earning", "Courier Earning"),
        ("merchant_earning", "Merchant Earning"),
        ("payout", "Payout"),
        ("withdrawal", "Withdrawal"),
        ("refund", "Refund"),
        ("referral", "Referral Reward"),
        ("bonus", "Bonus"),
        ("no_show", "Rider No-Show Compensation"),
        ("adjustment", "Admin Adjustment"),
    ]
    wallet = models.ForeignKey(WalletAccount, on_delete=models.CASCADE, related_name="transactions")
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    is_credit = models.BooleanField()
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["wallet", "-created_at"], name="wallet_tx_history_idx")]


class CommissionConfig(models.Model):
    """Admin-configurable commission rates per vertical."""

    VERTICAL_CHOICES = [
        ("delivery", "Delivery"),
        ("merchant", "Merchant Order"),
    ]

    vertical = models.CharField(max_length=20, choices=VERTICAL_CHOICES, unique=True)
    courier_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0.80)
    platform_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0.20)
    merchant_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0.90,
        help_text="Share of goods subtotal kept by merchant.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.vertical} commission config"


class PaymentRecord(models.Model):
    """Unified payment ledger for deliveries, merchant orders, and rides."""

    METHOD_CHOICES = [
        ("cash", "Cash"),
        ("card", "Card"),
        ("wallet", "Wallet"),
        ("bankily", "Bankily"),
        ("masrvi", "Masravi"),
        ("seddad", "Seddad"),
        ("promo_credit", "Promo / Credit"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("authorized", "Authorized"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
        ("cancelled", "Cancelled"),
    ]

    TIMING_CHOICES = [
        ("before_delivery", "Before Delivery"),
        ("after_delivery", "After Delivery"),
        ("cash_on_delivery", "Cash on Delivery"),
    ]

    SOURCE_CHOICES = [
        ("ride", "Ride"),
        ("delivery", "Delivery"),
        ("merchant_order", "Merchant Order"),
    ]

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )
    courier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="courier_payment_records",
    )
    merchant = models.ForeignKey(
        "merchants.Merchant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )

    ride_id = models.IntegerField(null=True, blank=True)
    delivery = models.ForeignKey(
        "deliveries.Delivery",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )
    merchant_order = models.ForeignKey(
        "merchants.MerchantOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    promo_discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="cash")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    payment_timing = models.CharField(
        max_length=20, choices=TIMING_CHOICES, default="after_delivery"
    )
    transaction_id = models.CharField(max_length=120, blank=True, default="")
    provider_token = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Tokenized payment reference only — never store raw card data.",
    )

    app_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    courier_earning = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    merchant_earning = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    wallet_transaction = models.ForeignKey(
        WalletTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )
    currency = models.CharField(max_length=10, default="MRU")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="payment_record_status_idx"),
            models.Index(fields=["source", "-created_at"], name="payment_record_source_idx"),
        ]

    def __str__(self):
        return f"PaymentRecord #{self.id} — {self.source} — {self.amount} {self.currency}"


class RefundRequest(models.Model):
    REASON_CHOICES = [
        ("cancelled_order", "Cancelled Order"),
        ("failed_delivery", "Failed Delivery"),
        ("merchant_rejected", "Merchant Rejected Order"),
        ("customer_complaint", "Customer Complaint"),
    ]

    STATUS_CHOICES = [
        ("requested", "Requested"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("refunded", "Refunded"),
    ]

    payment_record = models.ForeignKey(
        PaymentRecord, on_delete=models.CASCADE, related_name="refund_requests"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="refund_requests",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="requested")
    note = models.TextField(blank=True, default="")
    admin_note = models.TextField(blank=True, default="")
    fraud_flag = models.BooleanField(default=False)
    wallet_refund_tx = models.ForeignKey(
        WalletTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="refund_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Refund #{self.id} — {self.amount} — {self.status}"


class MerchantWithdrawalRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paid", "Paid"),
    ]

    merchant = models.ForeignKey(
        "merchants.Merchant",
        on_delete=models.CASCADE,
        related_name="withdrawal_requests",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    note = models.TextField(blank=True, default="")
    admin_note = models.TextField(blank=True, default="")
    reference = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class PlatformWithdrawalAccounts(models.Model):
    """Singleton platform payout destinations for driver/courier withdrawals."""

    PLATFORM_KEY = "platform"

    key = models.CharField(max_length=32, unique=True, default=PLATFORM_KEY)
    bank_account = models.CharField(max_length=64, blank=True, default="")
    bankily_number = models.CharField(max_length=32, blank=True, default="")
    seddad_number = models.CharField(max_length=32, blank=True, default="")
    masravi_number = models.CharField(max_length=32, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_withdrawal_account_updates",
    )

    class Meta:
        verbose_name = "Platform withdrawal accounts"
        verbose_name_plural = "Platform withdrawal accounts"

    def __str__(self):
        return "Yala platform withdrawal accounts"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(key=cls.PLATFORM_KEY)
        return obj
