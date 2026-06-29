from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0003_delivery_service_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverdeliverysettings",
            name="delivery_vehicle_type",
            field=models.CharField(
                choices=[
                    ("bicycle", "Bicycle"),
                    ("motorcycle", "Motorcycle"),
                    ("car", "Car"),
                ],
                default="motorcycle",
                max_length=20,
            ),
        ),
    ]
