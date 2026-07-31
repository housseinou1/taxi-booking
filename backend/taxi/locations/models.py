from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils.text import slugify


class Region(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Department(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="departments")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    service_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["region__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["region", "name"],
                name="unique_department_region_name",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.region.name}-{self.name}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}, {self.region.name}"


class Commune(models.Model):
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="communes",
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    service_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["department__region__name", "department__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["department", "name"],
                name="unique_commune_department_name",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(
                f"{self.department.region.name}-{self.department.name}-{self.name}"
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}, {self.department.name}"


class Locality(models.Model):
    commune = models.ForeignKey(
        Commune,
        on_delete=models.PROTECT,
        related_name="localities",
    )
    name = models.CharField(max_length=140)
    slug = models.SlugField(max_length=260, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    service_enabled = models.BooleanField(default=False)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            "commune__department__region__name",
            "commune__department__name",
            "commune__name",
            "name",
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["commune", "name"],
                name="unique_locality_commune_name",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(
                f"{self.commune.department.region.name}-"
                f"{self.commune.department.name}-{self.commune.name}-{self.name}"
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}, {self.commune.name}"


class City(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="cities")
    commune = models.ForeignKey(
        Commune,
        on_delete=models.SET_NULL,
        related_name="service_cities",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["region__name", "name"]
        constraints = [
            models.UniqueConstraint(fields=["region", "name"], name="unique_city_region_name"),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.region.name}-{self.name}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}, {self.region.name}"


class CityPricing(models.Model):
    RIDE_TYPES = [
        ("regular", "Regular"),
        ("xl", "XL"),
        ("comfort", "Comfort"),
        ("share", "Share"),
    ]

    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name="pricing")
    ride_type = models.CharField(max_length=20, choices=RIDE_TYPES, default="regular")
    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("200.00"))
    per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("20.00"))
    minimum_fare = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["city__name", "ride_type"]
        constraints = [
            models.UniqueConstraint(fields=["city", "ride_type"], name="unique_city_ride_pricing"),
        ]

    def calculate_fare(self, distance_km):
        distance = max(Decimal(str(distance_km or 0)), Decimal("0"))
        fare = self.base_fare + (distance * self.per_km)
        fare = max(fare, self.base_fare, self.minimum_fare)
        return fare.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def __str__(self):
        return f"{self.city.name} {self.ride_type}"
