from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("deliveries", "0016_delivery_message_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverdeliverysettings",
            name="chat_warnings",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="hidden_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="hidden_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="hidden_delivery_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="hidden_reason",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="is_hidden",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="report_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="DeliveryChatReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "reason",
                    models.CharField(
                        choices=[
                            ("harassment", "Harassment"),
                            ("inappropriate_message", "Inappropriate message"),
                            ("wrong_address", "Wrong address"),
                            ("unsafe_situation", "Unsafe situation"),
                            ("fraud_attempt", "Fraud attempt"),
                        ],
                        max_length=40,
                    ),
                ),
                ("details", models.TextField(blank=True, default="", max_length=1000)),
                (
                    "status",
                    models.CharField(
                        choices=[("open", "Open"), ("reviewed", "Reviewed"), ("dismissed", "Dismissed")],
                        default="open",
                        max_length=20,
                    ),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "delivery",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_reports",
                        to="deliveries.delivery",
                    ),
                ),
                (
                    "dispute",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="chat_reports",
                        to="deliveries.deliverydispute",
                    ),
                ),
                (
                    "message",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reports",
                        to="deliveries.deliverymessage",
                    ),
                ),
                (
                    "reported_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_chat_reports_filed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "reported_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="delivery_chat_reports_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "reviewed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="delivery_chat_reports_reviewed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="deliverychatreport",
            index=models.Index(fields=["status", "-created_at"], name="delivery_chat_rpt_idx"),
        ),
        migrations.AddIndex(
            model_name="deliverychatreport",
            index=models.Index(fields=["delivery", "-created_at"], name="delivery_chat_rpt_del_idx"),
        ),
    ]
