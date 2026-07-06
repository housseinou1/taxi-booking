from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0015_ride_offer_tracking"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="cancellation_reason_details",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Additional details when the cancellation reason is Other.",
            ),
        ),
    ]
