from decimal import Decimal

from django.db import migrations, models
from django.utils.text import slugify
import django.db.models.deletion


MAURITANIA_REGIONS = {
    "Nouakchott": ["Nouakchott"],
    "Dakhlet Nouadhibou": ["Nouadhibou", "Chami"],
    "Adrar": ["Atar", "Chinguetti", "Ouadane", "Aoujeft"],
    "Inchiri": ["Akjoujt", "Benichab"],
    "Trarza": ["Rosso", "Boutilimit", "Keur Macène", "Mederdra", "R'Kiz"],
    "Brakna": ["Aleg", "Boghé", "Bababé", "Magta Lahjar"],
    "Gorgol": ["Kaédi", "M'Bout", "Maghama", "Toulel", "Monguel"],
    "Guidimaka": ["Sélibaby", "Ould Yengé"],
    "Assaba": ["Kiffa", "Guerou", "Barkéol", "Kankossa"],
    "Hodh El Gharbi": ["Aioun", "Tintane", "Kobeni", "Tamchekett"],
    "Hodh Ech Chargui": ["Néma", "Bassiknou", "Djiguenni", "Amourj"],
    "Tagant": ["Tidjikja", "Tichit", "Moudjéria"],
    "Tiris Zemmour": ["Zouérat", "F'Dérik", "Bir Moghrein"],
    "Guidimakha": ["Sélibaby", "Wompou"],
}


DEFAULT_PRICING = {
    "regular": (Decimal("200.00"), Decimal("20.00")),
    "xl": (Decimal("300.00"), Decimal("30.00")),
    "comfort": (Decimal("350.00"), Decimal("35.00")),
    "share": (Decimal("150.00"), Decimal("15.00")),
}


def seed_locations(apps, schema_editor):
    Region = apps.get_model("locations", "Region")
    City = apps.get_model("locations", "City")
    CityPricing = apps.get_model("locations", "CityPricing")

    for region_name, cities in MAURITANIA_REGIONS.items():
        region, _ = Region.objects.get_or_create(
            name=region_name,
            defaults={"slug": slugify(region_name)},
        )
        for city_name in cities:
            city, _ = City.objects.get_or_create(
                region=region,
                name=city_name,
                defaults={
                    "slug": slugify(f"{region_name}-{city_name}"),
                    "is_default": region_name == "Nouakchott" and city_name == "Nouakchott",
                },
            )
            for ride_type, (base_fare, per_km) in DEFAULT_PRICING.items():
                CityPricing.objects.get_or_create(
                    city=city,
                    ride_type=ride_type,
                    defaults={
                        "base_fare": base_fare,
                        "per_km": per_km,
                        "minimum_fare": Decimal("0.00"),
                    },
                )


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Region",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True)),
                ("slug", models.SlugField(blank=True, max_length=140, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="City",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(blank=True, max_length=140, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("is_default", models.BooleanField(default=False)),
                ("latitude", models.FloatField(blank=True, null=True)),
                ("longitude", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("region", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="cities", to="locations.region")),
            ],
            options={"ordering": ["region__name", "name"]},
        ),
        migrations.CreateModel(
            name="CityPricing",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ride_type", models.CharField(choices=[("regular", "Regular"), ("xl", "XL"), ("comfort", "Comfort"), ("share", "Share")], default="regular", max_length=20)),
                ("base_fare", models.DecimalField(decimal_places=2, default=Decimal("200.00"), max_digits=10)),
                ("per_km", models.DecimalField(decimal_places=2, default=Decimal("20.00"), max_digits=10)),
                ("minimum_fare", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("city", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="pricing", to="locations.city")),
            ],
            options={"ordering": ["city__name", "ride_type"]},
        ),
        migrations.AddConstraint(
            model_name="city",
            constraint=models.UniqueConstraint(fields=("region", "name"), name="unique_city_region_name"),
        ),
        migrations.AddConstraint(
            model_name="citypricing",
            constraint=models.UniqueConstraint(fields=("city", "ride_type"), name="unique_city_ride_pricing"),
        ),
        migrations.RunPython(seed_locations, migrations.RunPython.noop),
    ]
