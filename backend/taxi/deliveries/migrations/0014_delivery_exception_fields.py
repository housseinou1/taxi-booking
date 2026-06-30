from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("deliveries", "0013_delivery_dropoff_pin"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="exception_reason",
            field=models.CharField(
                blank=True,
                choices=[
                    ("recipient_unavailable", "Recipient unavailable"),
                    ("recipient_forgot_pin", "Recipient forgot PIN"),
                    ("recipient_phone_unreachable", "Phone unreachable"),
                    ("recipient_refused_pin", "Recipient refused PIN"),
                    ("other", "Other"),
                ],
                default="",
                max_length=40,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="exception_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="delivery",
            name="exception_reported_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="exception_resolution",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "Pending review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("refunded", "Refunded"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="exception_resolved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="exception_resolved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="resolved_delivery_exceptions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
