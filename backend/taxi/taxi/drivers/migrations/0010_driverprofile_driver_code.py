# Generated manually - adds driver_code field to DriverProfile

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0009_qr_code_verification"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="driver_code",
            field=models.CharField(
                blank=True, max_length=6, null=True, unique=True
            ),
        ),
    ]
