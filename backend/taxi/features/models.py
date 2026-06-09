"""
Yala Advanced Features:
1. Airport Pickup System
2. Corporate/Business Accounts
3. Lost & Found Management
4. Driver Referral Program
5. Surge Pricing
"""
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone
import secrets


# ═══════════════════════════════════════════════════════════════════════════════
# 1. AIRPORT PICKUP SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

class AirportLocation(models.Model):
    """Registered airport or station for pickup scheduling."""
    name = models.CharField(max_length=200)
    city = models.ForeignKey("cities.City", on_delete=models.CASCADE, related_name="airports")
    latitude = models.FloatField()
    longitude = models.FloatField()
    terminal_info = models.TextField(blank=True, default="")
    pickup_instructions = models.TextField(blank=True, default="Meet at arrivals gate")
    surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class AirportPickup(models.Model):
    """Scheduled airport pickup linked to a ride."""
    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("driver_assigned", "Driver Assigned"),
        ("driver_en_route", "Driver En Route"),
        ("waiting_at_airport", "Waiting at Airport"),
        ("passenger_picked_up", "Passenger Picked Up"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    rider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="airport_pickups")
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="airport_pickup_jobs")
    ride = models.OneToOneField("rides.Ride", on_delete=models.SET_NULL, null=True, blank=True, related_name="airport_pickup")
    airport = models.ForeignKey(AirportLocation, on_delete=models.CASCADE, related_name="pickups")
    flight_number = models.CharField(max_length=20, blank=True, default="")
    arrival_time = models.DateTimeField()
    destination = models.CharField(max_length=255)
    destination_lat = models.FloatField(default=0)
    destination_lng = models.FloatField(default=0)
    passenger_name = models.CharField(max_length=200, blank=True, default="")
    passenger_phone = models.CharField(max_length=40, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="scheduled")
    fare_estimate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-arrival_time"]

    def __str__(self):
        return f"Airport pickup #{self.id} - {self.airport.name}"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. CORPORATE / BUSINESS ACCOUNTS
# ═══════════════════════════════════════════════════════════════════════════════

class CorporateAccount(models.Model):
    """Business account with billing and employee management."""
    BILLING_CHOICES = [
        ("monthly_invoice", "Monthly Invoice"),
        ("prepaid", "Prepaid Balance"),
        ("per_ride", "Per Ride"),
    ]

    company_name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=40)
    billing_type = models.CharField(max_length=20, choices=BILLING_CHOICES, default="monthly_invoice")
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("50000"))
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    city = models.ForeignKey("cities.City", on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.company_name


class CorporateEmployee(models.Model):
    """Employee linked to a corporate account."""
    account = models.ForeignKey(CorporateAccount, on_delete=models.CASCADE, related_name="employees")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="corporate_profile")
    employee_id = models.CharField(max_length=50, blank=True, default="")
    department = models.CharField(max_length=100, blank=True, default="")
    monthly_limit = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("10000"))
    monthly_spent = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("account", "user")

    def __str__(self):
        return f"{self.user.email} @ {self.account.company_name}"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. LOST & FOUND MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class LostItem(models.Model):
    """Item lost or found during a ride."""
    STATUS_CHOICES = [
        ("reported", "Reported"),
        ("searching", "Searching"),
        ("found", "Found"),
        ("returned", "Returned"),
        ("not_found", "Not Found"),
    ]
    REPORTED_BY_CHOICES = [
        ("rider", "Rider"),
        ("driver", "Driver"),
    ]

    reference = models.CharField(max_length=20, unique=True, editable=False)
    ride = models.ForeignKey("rides.Ride", on_delete=models.SET_NULL, null=True, blank=True, related_name="lost_items")
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lost_item_reports")
    reported_by_role = models.CharField(max_length=10, choices=REPORTED_BY_CHOICES, default="rider")
    item_description = models.TextField()
    item_category = models.CharField(max_length=50, default="other")  # phone, wallet, bag, documents, keys, other
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="reported")
    rider_phone = models.CharField(max_length=40, blank=True, default="")
    driver_phone = models.CharField(max_length=40, blank=True, default="")
    resolution_notes = models.TextField(blank=True, default="")
    photo = models.ImageField(upload_to="lost_found/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"LF-{secrets.token_hex(4).upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference} - {self.item_description[:40]}"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. DRIVER REFERRAL PROGRAM
# ═══════════════════════════════════════════════════════════════════════════════

class DriverReferral(models.Model):
    """Driver refers another driver to the platform."""
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("qualified", "Qualified"),
        ("paid", "Paid"),
        ("expired", "Expired"),
    ]

    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_referrals_made")
    referred_driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_referral_received")
    referral_code = models.CharField(max_length=30)
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("500"))
    required_rides = models.PositiveIntegerField(default=10)  # rides the new driver must complete
    completed_rides = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    referrer_paid = models.BooleanField(default=False)
    referred_paid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    qualified_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("referrer", "referred_driver")

    def __str__(self):
        return f"{self.referrer.email} → {self.referred_driver.email}"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. SURGE PRICING
# ═══════════════════════════════════════════════════════════════════════════════

class SurgeZone(models.Model):
    """Dynamic pricing zone based on demand/supply."""
    city = models.ForeignKey("cities.City", on_delete=models.CASCADE, related_name="surge_zones")
    name = models.CharField(max_length=100)
    multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("1.0"))  # 1.0 = no surge, 2.0 = 2x
    is_active = models.BooleanField(default=True)
    reason = models.CharField(max_length=200, blank=True, default="")  # "Peak hours", "Rain", "Event"
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-multiplier"]

    @property
    def is_currently_active(self):
        now = timezone.now()
        if not self.is_active:
            return False
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        return True

    def __str__(self):
        return f"{self.city.name} - {self.multiplier}x ({self.reason})"


class SurgeHistory(models.Model):
    """Log of surge pricing applied to rides."""
    ride = models.OneToOneField("rides.Ride", on_delete=models.CASCADE, related_name="surge_history")
    zone = models.ForeignKey(SurgeZone, on_delete=models.SET_NULL, null=True, blank=True)
    multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("1.0"))
    original_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    surge_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    reason = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ride #{self.ride_id} - {self.multiplier}x"
