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
