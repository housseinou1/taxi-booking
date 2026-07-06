from django.conf import settings
from django.db import migrations, models

import taxi.rides.models.ride


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("rides", "0014_ride_cancellation_fee_ride_cancellation_reason_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="offered_driver",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="offered_rides",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="offer_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="ride",
            name="declined_driver_ids",
            field=models.JSONField(
                blank=True,
                default=taxi.rides.models.ride.default_declined_driver_ids,
            ),
        ),
    ]
