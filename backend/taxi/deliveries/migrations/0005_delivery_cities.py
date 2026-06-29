from django.db import migrations, models


def set_default_delivery_cities(apps, schema_editor):
    DriverDeliverySettings = apps.get_model("deliveries", "DriverDeliverySettings")
    for settings_obj in DriverDeliverySettings.objects.all():
        if not settings_obj.delivery_cities:
            settings_obj.delivery_cities = ["Nouakchott"]
            settings_obj.save(update_fields=["delivery_cities"])


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0004_delivery_vehicle_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="service_city",
            field=models.CharField(default="Nouakchott", max_length=120),
        ),
        migrations.AddField(
            model_name="driverdeliverysettings",
            name="delivery_cities",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(set_default_delivery_cities, migrations.RunPython.noop),
    ]
