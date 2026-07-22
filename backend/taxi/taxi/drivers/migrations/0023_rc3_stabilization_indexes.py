# Generated manually for RC3 stabilization indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0022_smart_dispatch"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="driverprofile",
            index=models.Index(fields=["status", "is_available"], name="driver_status_available_idx"),
        ),
        migrations.AddIndex(
            model_name="driverdocument",
            index=models.Index(fields=["status", "expires_at"], name="driverdoc_status_exp_idx"),
        ),
    ]
