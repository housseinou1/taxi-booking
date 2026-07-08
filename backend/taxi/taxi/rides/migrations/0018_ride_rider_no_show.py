# Generated manually for Lyft-style rider no-show.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0017_ride_rider_call_attempts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ride",
            name="status",
            field=models.CharField(
                choices=[
                    ("requested", "Requested"),
                    ("scheduled", "Scheduled"),
                    ("driver_arriving", "Driver Arriving"),
                    ("driver_arrived", "Driver Arrived"),
                    ("in_progress", "In Progress"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                    ("rider_no_show", "Rider No-Show"),
                ],
                default="requested",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="is_rider_no_show",
            field=models.BooleanField(
                default=False,
                help_text="True when the ride ended as a verified rider no-show.",
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="no_show_fee",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Fee charged to the rider for a verified no-show.",
                max_digits=10,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="no_show_driver_compensation",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Compensation credited to the driver for a verified rider no-show.",
                max_digits=10,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="no_show_evidence",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Anti-abuse evidence: GPS, wait time, device, timestamps.",
            ),
        ),
    ]
