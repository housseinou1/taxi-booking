from django.db import migrations


def add_nouakchott_service_city(apps, schema_editor):
    Region = apps.get_model("cities", "Region")
    City = apps.get_model("cities", "City")

    region, _ = Region.objects.get_or_create(
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "is_active": True,
        },
    )
    City.objects.get_or_create(
        region=region,
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "latitude": 18.0735,
            "longitude": -15.9582,
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("cities", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_nouakchott_service_city, migrations.RunPython.noop),
    ]
