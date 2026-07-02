import deliveries.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0012_delivery_notifications_phase2"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="dropoff_pin",
            field=models.CharField(
                default=deliveries.models.generate_delivery_dropoff_pin,
                help_text="PIN sent to recipient for delivery confirmation.",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="dropoff_pin_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
