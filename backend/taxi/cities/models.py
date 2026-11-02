from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Region(models.Model):
    """Administrative region (wilaya) of Mauritania."""
    name = models.CharField(max_length=100, unique=True)
    name_ar = models.CharField(max_length=100, blank=True, default="")
    name_fr = models.CharField(max_length=100, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class City(models.Model):
    """City within a region. Drivers/riders are associated with a city."""
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="cities")
    name = models.CharField(max_length=100)
    name_ar = models.CharField(max_length=100, blank=True, default="")
    name_fr = models.CharField(max_length=100, blank=True, default="")
    latitude = models.FloatField(default=0)
    longitude = models.FloatField(default=0)
    is_active = models.BooleanField(default=True)

    # City-specific pricing overrides (null = use global pricing)
    base_price_regular = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    per_km_regular = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    base_price_xl = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    per_km_xl = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    base_price_comfort = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    per_km_comfort = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["region__name", "name"]
        unique_together = ("region", "name")
        verbose_name_plural = "cities"

    def __str__(self):
        return f"{self.name} ({self.region.name})"


# ═══════════════════════════════════════════════════════════════════════════════
# DYNAMIC CITY MANAGEMENT
#
# ``City`` above is the canonical service-city registry: it is the model that
# ``authapp.User.city`` (drivers, riders, couriers), features, intercity and
# shifts already reference, and the one the public ``/cities/`` API serves.
# Nothing below replaces or duplicates it — it only adds the CEO-managed
# activation, pricing and service-area layers on top of the existing registry.
# ═══════════════════════════════════════════════════════════════════════════════

SERVICE_RIDER = "rider"
SERVICE_DRIVER = "driver"
SERVICE_DELIVERY = "delivery"

SERVICE_CHOICES = [
    (SERVICE_RIDER, "YALA RIDER"),
    (SERVICE_DRIVER, "YALA DRIVER"),
    (SERVICE_DELIVERY, "YALA DELIVERY"),
]

#: Every independently switchable service/category per city. A city may support
#: rides without delivery or delivery without rides.
SERVICE_CATALOG = {
    SERVICE_RIDER: [
        ("standard", "Standard rides"),
        ("shared", "Shared rides"),
    ],
    SERVICE_DRIVER: [
        ("registration", "Driver registration"),
        ("availability", "Driver availability"),
        ("matching", "Driver matching"),
    ],
    SERVICE_DELIVERY: [
        ("food", "Food delivery"),
        ("grocery", "Grocery delivery"),
        ("pharmacy", "Pharmacy delivery"),
        ("parcel", "Parcel delivery"),
        ("document", "Document delivery"),
        ("shopping", "Shopping delivery"),
    ],
}

SERVICE_LABELS = {
    SERVICE_RIDER: "YALA RIDER",
    SERVICE_DRIVER: "YALA DRIVER",
    SERVICE_DELIVERY: "YALA DELIVERY",
}


def service_categories(service):
    """Return the valid category codes for a service."""
    return [code for code, _label in SERVICE_CATALOG.get(service, [])]


def service_category_label(service, category):
    """Human label for one service category."""
    for code, label in SERVICE_CATALOG.get(service, []):
        if code == category:
            return label
    return category


class CityServiceConfig(models.Model):
    """Independent activation of one service/category for one city.

    Every row defaults to ``is_active=False``: adding a city never switches a
    service on. Only an authorized administrator (or the CEO) can activate one.
    """

    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name="service_configs")
    service = models.CharField(max_length=20, choices=SERVICE_CHOICES)
    category = models.CharField(max_length=40)
    is_active = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    activated_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="city_service_activations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["city__name", "service", "category"]
        constraints = [
            models.UniqueConstraint(
                fields=["city", "service", "category"],
                name="unique_city_service_category",
            ),
        ]

    @property
    def label(self):
        return service_category_label(self.service, self.category)

    def __str__(self):
        state = "active" if self.is_active else "inactive"
        return f"{self.city.name} · {self.service}/{self.category} · {state}"


class CityPricingProfile(models.Model):
    """City-specific pricing. Never activated without CEO authorization.

    A new city gets an empty profile with ``is_active=False``; existing pricing
    (Nouakchott or any other city) is never copied automatically.
    """

    city = models.OneToOneField(City, on_delete=models.CASCADE, related_name="pricing_profile")
    currency = models.CharField(max_length=8, default="MRU")

    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    per_minute = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    minimum_fare = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    waiting_per_minute = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    service_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    shared_base_fare = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    shared_per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    shared_discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00")
    )

    delivery_base_fare = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    delivery_per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    delivery_minimum_fare = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    surge_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal("1.00"),
        help_text="Applicable pricing adjustment. 1.00 means no adjustment.",
    )
    is_active = models.BooleanField(
        default=False,
        help_text="Live pricing gate. Requires explicit CEO authorization.",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_city_pricing",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "city pricing profile"

    def clean(self):
        super().clean()
        money_fields = [
            "base_fare",
            "per_km",
            "per_minute",
            "minimum_fare",
            "waiting_per_minute",
            "service_fee",
            "shared_base_fare",
            "shared_per_km",
            "shared_discount_percent",
            "delivery_base_fare",
            "delivery_per_km",
            "delivery_minimum_fare",
        ]
        for field_name in money_fields:
            value = getattr(self, field_name, None) or Decimal("0.00")
            if value < Decimal("0.00"):
                raise ValidationError({field_name: "Must be non-negative."})
        if (self.surge_multiplier or Decimal("0.00")) < Decimal("1.00"):
            raise ValidationError(
                {"surge_multiplier": "Must be 1.00 or greater (a discount is not a surge)."}
            )
        if self.minimum_fare and self.base_fare and self.minimum_fare < self.base_fare:
            raise ValidationError(
                {"minimum_fare": "Minimum fare must not be less than base fare."}
            )

    def estimate_ride_fare(self, distance_km, *, shared=False):
        """Deterministic estimate from this profile (used for previews only)."""
        base = self.shared_base_fare if shared else self.base_fare
        per_km = self.shared_per_km if shared else self.per_km
        distance = max(Decimal(str(distance_km or 0)), Decimal("0"))
        fare = base + (distance * per_km) + self.service_fee
        if self.minimum_fare:
            fare = max(fare, self.minimum_fare)
        return (fare * (self.surge_multiplier or Decimal("1.00"))).quantize(Decimal("0.01"))

    def estimate_delivery_fare(self, distance_km):
        """Deterministic delivery estimate from this profile."""
        distance = max(Decimal(str(distance_km or 0)), Decimal("0"))
        fare = self.delivery_base_fare + (distance * self.delivery_per_km) + self.service_fee
        if self.delivery_minimum_fare:
            fare = max(fare, self.delivery_minimum_fare)
        return fare.quantize(Decimal("0.01"))

    def __str__(self):
        state = "active" if self.is_active else "inactive"
        return f"{self.city.name} pricing ({state})"


class CityServiceArea(models.Model):
    """Operational boundary for a city. Coverage is never assumed to be uniform.

    A boundary is either a centre + radius, or an explicit polygon. Both are
    optional so a city can be registered before its geography is surveyed.
    """

    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name="service_areas")
    name = models.CharField(max_length=120)
    center_latitude = models.FloatField(null=True, blank=True)
    center_longitude = models.FloatField(null=True, blank=True)
    radius_km = models.FloatField(null=True, blank=True)
    polygon = models.JSONField(
        null=True,
        blank=True,
        help_text="List of [latitude, longitude] pairs describing the boundary.",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["city__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["city", "name"], name="unique_city_service_area_name"
            ),
        ]

    def clean(self):
        super().clean()
        if self.radius_km is not None and self.radius_km <= 0:
            raise ValidationError({"radius_km": "Radius must be greater than zero."})
        for field_name in ["center_latitude", "center_longitude"]:
            value = getattr(self, field_name, None)
            if value is None:
                continue
            limit = 90 if field_name.endswith("latitude") else 180
            if not -limit <= value <= limit:
                raise ValidationError({field_name: f"Must be between -{limit} and {limit}."})
        if self.radius_km and self.center_latitude is None:
            raise ValidationError(
                {"center_latitude": "A radius boundary requires a centre point."}
            )
        if self.polygon is not None:
            if not isinstance(self.polygon, list) or len(self.polygon) < 3:
                raise ValidationError(
                    {"polygon": "A polygon boundary needs at least three points."}
                )
            for point in self.polygon:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    raise ValidationError(
                        {"polygon": "Each point must be a [latitude, longitude] pair."}
                    )

    def __str__(self):
        return f"{self.city.name} · {self.name}"


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres."""
    from math import asin, cos, radians, sin, sqrt

    lat1, lon1, lat2, lon2 = map(
        radians, [float(lat1), float(lon1), float(lat2), float(lon2)]
    )
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(a))


def point_in_polygon(latitude, longitude, polygon):
    """Ray-casting point-in-polygon test on ``[latitude, longitude]`` pairs."""
    inside = False
    points = [(float(p[0]), float(p[1])) for p in polygon]
    j = len(points) - 1
    for i, (yi, xi) in enumerate(points):
        yj, xj = points[j]
        if (xi > longitude) != (xj > longitude):
            slope = (yj - yi) / ((xj - xi) or 1e-12)
            if latitude < yi + slope * (longitude - xi):
                inside = not inside
        j = i
    return inside


#: Add the boundary test to ``CityServiceArea`` after the geometry helpers exist.
def _service_area_contains(self, latitude, longitude):
    """True when the coordinate falls inside this boundary."""
    if latitude is None or longitude is None:
        return False
    if self.polygon:
        return point_in_polygon(float(latitude), float(longitude), self.polygon)
    if self.radius_km and self.center_latitude is not None:
        return (
            haversine_km(self.center_latitude, self.center_longitude, latitude, longitude)
            <= self.radius_km
        )
    return False


CityServiceArea.contains = _service_area_contains


class CityProfile(models.Model):
    """Additive metadata for a city: geography, identity and the live gate.

    Deliberately a separate table rather than new columns on ``City``. Adding
    columns to the existing registry would make every current city query fail
    in a local database where ``cities.0005_city_management`` has not yet been
    applied; a new table changes nothing until it is read.
    """

    city = models.OneToOneField(City, on_delete=models.CASCADE, related_name="profile")
    country = models.CharField(max_length=80, default="Mauritania")
    iso_country_code = models.CharField(max_length=2, default="MR")
    timezone = models.CharField(max_length=64, default="Africa/Nouakchott")
    code = models.CharField(
        max_length=12,
        blank=True,
        default="",
        help_text="Stable short code for operations, e.g. ATR.",
    )
    is_live = models.BooleanField(
        default=False,
        help_text=(
            "Live-operations gate. New cities stay False so no real ride or "
            "delivery booking can start until the CEO activates the city."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "city profile"

    def __str__(self):
        return f"{self.city.name} profile"





