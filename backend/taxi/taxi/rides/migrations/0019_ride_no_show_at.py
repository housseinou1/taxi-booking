from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0018_ride_rider_no_show"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="no_show_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the driver completed a verified rider no-show.",
                null=True,
            ),
        ),
    ]
