from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

TARGET_CITIES = [
    {
        "names": ["Nouakchott"],
        "status": "active",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Greater Nouakchott", "lat": 18.0735, "lng": -15.9582, "radius_km": 25}],
    },
    {
        "names": ["Nouadhibou"],
        "status": "active",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Nouadhibou Centre", "lat": 20.9419, "lng": -17.0384, "radius_km": 15}],
    },
    {
        "names": ["Rosso"],
        "status": "pilot",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Rosso", "lat": 16.5138, "lng": -15.805, "radius_km": 12}],
    },
    {
        "names": ["Kaédi", "Kaedi"],
        "status": "pilot",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Kaédi", "lat": 16.1503, "lng": -13.5037, "radius_km": 12}],
    },
    {
        "names": ["Kiffa"],
        "status": "pilot",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Kiffa", "lat": 16.6166, "lng": -11.4042, "radius_km": 12}],
    },
    {
        "names": ["Atar"],
        "status": "pilot",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Atar", "lat": 20.5169, "lng": -13.0489, "radius_km": 15}],
    },
    {
        "names": ["Zouerat", "Zouerate"],
        "status": "pilot",
        "timezone": "Africa/Nouakchott",
        "zones": [{"name": "Zouerat", "lat": 22.7354, "lng": -12.4783, "radius_km": 15}],
    },
]


def seed_ops_city_profiles(apps, schema_editor):
    City = apps.get_model("locations", "City")
    OpsCityProfile = apps.get_model("operations", "OpsCityProfile")
    seen = set()

    for entry in TARGET_CITIES:
        city = None
        for name in entry["names"]:
            city = City.objects.filter(name__iexact=name).first()
            if city:
                break
        if not city:
            for name in entry["names"]:
                city = City.objects.filter(name__icontains=name).first()
                if city:
                    break
        if not city or city.id in seen:
            continue
        seen.add(city.id)
        OpsCityProfile.objects.get_or_create(
            city_id=city.id,
            defaults={
                "status": entry["status"],
                "timezone": entry["timezone"],
                "currency": "MRU",
                "service_zones": entry["zones"],
            },
        )


def unseed_ops_city_profiles(apps, schema_editor):
    OpsCityProfile = apps.get_model("operations", "OpsCityProfile")
    OpsCityProfile.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("operations", "0009_rename_operations__status_6a0f2d_idx_operations__status_cf430e_idx_and_more"),
        ("locations", "0004_repair_missing_location_tables"),
    ]

    operations = [
        migrations.CreateModel(
            name="OpsCityProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[("pilot", "Pilot"), ("active", "Active"), ("suspended", "Suspended")],
                        default="pilot",
                        max_length=20,
                    ),
                ),
                ("service_zones", models.JSONField(blank=True, default=list)),
                ("timezone", models.CharField(default="Africa/Nouakchott", max_length=64)),
                ("currency", models.CharField(default="MRU", max_length=10)),
                ("notes", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "city",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ops_profile",
                        to="locations.city",
                    ),
                ),
                (
                    "finance_manager",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="managed_finance_cities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "operations_manager",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="managed_ops_cities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "support_manager",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="managed_support_cities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["city__name"]},
        ),
        migrations.RunPython(seed_ops_city_profiles, unseed_ops_city_profiles),
    ]
