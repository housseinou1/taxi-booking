from django.db import migrations, models

import taxi.rides.models.ride


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0010_add_share_ride_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="pickup_pin",
            field=models.CharField(
                default=taxi.rides.models.ride.generate_pickup_pin,
                editable=False,
                help_text="Secret PIN the rider gives the assigned driver at pickup.",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="pickup_pin_verified_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
    ]
