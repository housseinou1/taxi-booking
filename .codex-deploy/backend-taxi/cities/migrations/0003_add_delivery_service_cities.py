from django.db import migrations


DELIVERY_SERVICE_CITIES = [
    {
        "name": "Nouadhibou",
        "name_fr": "Nouadhibou",
        "name_ar": "نواذيبو",
        "latitude": 20.94188,
        "longitude": -17.03842,
    },
    {
        "name": "Atar",
        "name_fr": "Atar",
        "name_ar": "أطار",
        "latitude": 20.5169,
        "longitude": -13.0489,
    },
    {
        "name": "Kaedi",
        "name_fr": "Kaédi",
        "name_ar": "كيهيدي",
        "latitude": 16.1503,
        "longitude": -13.5037,
    },
    {
        "name": "Rosso",
        "name_fr": "Rosso",
        "name_ar": "روصو",
        "latitude": 16.51378,
        "longitude": -15.80503,
    },
]


def add_delivery_service_cities(apps, schema_editor):
    Region = apps.get_model("cities", "Region")
    City = apps.get_model("cities", "City")

    for entry in DELIVERY_SERVICE_CITIES:
        region, _ = Region.objects.get_or_create(
            name=entry["name"],
            defaults={
                "name_fr": entry["name_fr"],
                "name_ar": entry["name_ar"],
                "is_active": True,
            },
        )
        City.objects.get_or_create(
            region=region,
            name=entry["name"],
            defaults={
                "name_fr": entry["name_fr"],
                "name_ar": entry["name_ar"],
                "latitude": entry["latitude"],
                "longitude": entry["longitude"],
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("cities", "0002_add_nouakchott_service_city"),
    ]

    operations = [
        migrations.RunPython(add_delivery_service_cities, migrations.RunPython.noop),
    ]
