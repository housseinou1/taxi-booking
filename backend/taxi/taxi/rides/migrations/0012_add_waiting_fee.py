from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0010_add_share_ride_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="driver_arrived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="ride",
            name="waiting_fee",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Fee charged for rider keeping driver waiting beyond free waiting period.",
                max_digits=10,
            ),
        ),
    ]
