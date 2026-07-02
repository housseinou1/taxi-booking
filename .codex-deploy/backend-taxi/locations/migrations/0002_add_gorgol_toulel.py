from decimal import Decimal

from django.db import migrations
from django.utils.text import slugify


DEFAULT_PRICING = {
    "regular": (Decimal("200.00"), Decimal("20.00")),
    "xl": (Decimal("300.00"), Decimal("30.00")),
    "comfort": (Decimal("350.00"), Decimal("35.00")),
    "share": (Decimal("150.00"), Decimal("15.00")),
}


def add_toulel(apps, schema_editor):
    Region = apps.get_model("locations", "Region")
    City = apps.get_model("locations", "City")
    CityPricing = apps.get_model("locations", "CityPricing")

    gorgol, _ = Region.objects.get_or_create(
        name="Gorgol",
        defaults={"slug": "gorgol"},
    )
    toulel, _ = City.objects.get_or_create(
        region=gorgol,
        name="Toulel",
        defaults={"slug": slugify("Gorgol Toulel"), "is_active": True},
    )

    for ride_type, (base_fare, per_km) in DEFAULT_PRICING.items():
        CityPricing.objects.get_or_create(
            city=toulel,
            ride_type=ride_type,
            defaults={
                "base_fare": base_fare,
                "per_km": per_km,
                "minimum_fare": Decimal("0.00"),
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_toulel, migrations.RunPython.noop),
    ]
