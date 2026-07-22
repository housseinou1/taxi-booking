from django.conf import settings
from django.db import models
from django.utils import timezone


class Partner(models.Model):
    CONTRACT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("suspended", "Suspended"),
        ("terminated", "Terminated"),
    ]

    partner_name = models.CharField(max_length=200)
    company = models.CharField(max_length=200, blank=True, default="")
    contact_person = models.CharField(max_length=150)
    phone = models.CharField(max_length=30)
    email = models.EmailField()
    city = models.ForeignKey(
        "locations.City",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="partners",
    )
    territory_label = models.CharField(max_length=200, blank=True, default="")
    contract_status = models.CharField(
        max_length=20,
        choices=CONTRACT_STATUS_CHOICES,
        default="pending",
        db_index=True,
    )
    revenue_share = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0.70,
        help_text="Partner share of net revenue (e.g. 0.70 = 70%).",
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    admin_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="partner_profile",
    )
    regional_director = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_partners",
    )
    suspension_reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.partner_name

    @property
    def is_operational(self):
        return self.contract_status == "approved" and (
            self.end_date is None or self.end_date >= timezone.localdate()
        )


class PartnerTerritory(models.Model):
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="territories")
    city = models.ForeignKey("locations.City", on_delete=models.CASCADE, related_name="partner_territories")
    zone_name = models.CharField(max_length=120, default="Primary")
    service_boundary = models.JSONField(
        default=dict,
        blank=True,
        help_text="Geo bounds: {north, south, east, west} or polygon coordinates.",
    )
    allow_overlap = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["city__name", "zone_name"]
        verbose_name_plural = "Partner territories"

    def __str__(self):
        return f"{self.partner.partner_name} — {self.city.name} / {self.zone_name}"


class PartnerSettlement(models.Model):
    PERIOD_TYPE_CHOICES = [
        ("weekly", "Weekly"),
        ("monthly", "Monthly"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("paid", "Paid"),
        ("failed", "Failed"),
    ]

    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="settlements")
    period_type = models.CharField(max_length=10, choices=PERIOD_TYPE_CHOICES, default="weekly")
    period_start = models.DateField()
    period_end = models.DateField()
    gross_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    platform_commission = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    partner_payout = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    order_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    invoice_reference = models.CharField(max_length=64, blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_partner_settlements",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end", "-created_at"]

    def __str__(self):
        return f"{self.partner.partner_name} settlement {self.period_start}–{self.period_end}"
