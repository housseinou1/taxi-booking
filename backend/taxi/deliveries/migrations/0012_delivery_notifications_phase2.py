from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("deliveries", "0011_driverdeliverysettings_is_suspended_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="near_dropoff_notified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="delivery",
            name="near_pickup_notified",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="DeliveryCallSession",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("session_code", models.CharField(max_length=12, unique=True)),
                ("dial_number", models.CharField(max_length=30)),
                ("is_masked", models.BooleanField(default=False)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "courier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_call_sessions_as_courier",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_call_sessions_as_customer",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "delivery",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="call_sessions",
                        to="deliveries.delivery",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="DeliveryChatMessage",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("template_key", models.CharField(blank=True, default="", max_length=50)),
                ("text", models.TextField()),
                ("read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "delivery",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_messages",
                        to="deliveries.delivery",
                    ),
                ),
                (
                    "sender",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_chat_messages",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(
                        fields=["delivery", "created_at"],
                        name="delivery_chat_time_idx",
                    )
                ],
            },
        ),
    ]
