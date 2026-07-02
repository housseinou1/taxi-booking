from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0015_driversettings_notifications_delivery_updates"),
    ]

    operations = [
        migrations.AlterField(
            model_name="driverprofile",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("pending_review", "Pending Review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
