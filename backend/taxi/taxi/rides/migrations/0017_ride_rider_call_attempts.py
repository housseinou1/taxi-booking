from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0016_ride_cancellation_reason_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="rider_call_attempt_count",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Number of in-app Call Rider taps recorded by the assigned driver.",
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="rider_call_last_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp of the most recent Call Rider attempt.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="rider_call_attempts",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="List of {at, by_user_id} call attempt records.",
            ),
        ),
    ]
