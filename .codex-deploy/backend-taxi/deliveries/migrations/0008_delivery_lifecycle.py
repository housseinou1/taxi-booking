from django.conf import settings
from django.db import migrations, models
import deliveries.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("deliveries", "0007_delivery_category_expansion"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="pickup_pin",
            field=models.CharField(
                default=deliveries.models.generate_delivery_pickup_pin,
                help_text="PIN shown to customer for pickup verification.",
                max_length=4,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="pickup_pin_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="offered_driver",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="offered_deliveries",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="offer_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="declined_driver_ids",
            field=models.JSONField(blank=True, default=deliveries.models.default_declined_driver_ids),
        ),
        migrations.AddField(
            model_name="delivery",
            name="assignment_round",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="delivery",
            name="estimated_duration_minutes",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="payment_method",
            field=models.CharField(
                choices=[("cash", "Cash"), ("card", "Card"), ("wallet", "Yala Wallet")],
                default="cash",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="payment_status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="delivery",
            name="tip_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="customer_rating",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="customer_review",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="delivery",
            name="rated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
