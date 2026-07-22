# Generated manually for BetaFeedback model

import operations.models
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("operations", "0005_phase20_business_ops"),
    ]

    operations = [
        migrations.CreateModel(
            name="BetaFeedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(db_index=True, max_length=32, unique=True)),
                (
                    "app_type",
                    models.CharField(
                        choices=[("rider", "Rider"), ("driver", "Driver"), ("delivery", "Delivery")],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("bug", "Bug"),
                            ("crash", "Crash"),
                            ("payment", "Payment"),
                            ("ride", "Ride"),
                            ("delivery", "Delivery"),
                            ("account", "Account"),
                            ("ui", "UI/UX"),
                            ("performance", "Performance"),
                            ("other", "Other"),
                        ],
                        db_index=True,
                        max_length=30,
                    ),
                ),
                (
                    "severity",
                    models.CharField(
                        choices=[
                            ("P0", "P0 — Critical"),
                            ("P1", "P1 — High"),
                            ("P2", "P2 — Medium"),
                            ("P3", "P3 — Low"),
                        ],
                        db_index=True,
                        default="P2",
                        max_length=5,
                    ),
                ),
                ("description", models.TextField()),
                ("screenshot", models.ImageField(blank=True, null=True, upload_to="beta_feedback/%Y/%m/")),
                ("device", models.CharField(blank=True, default="", max_length=200)),
                ("app_version", models.CharField(blank=True, default="", max_length=40)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("investigating", "Investigating"),
                            ("fixed", "Fixed"),
                            ("closed", "Closed"),
                        ],
                        db_index=True,
                        default="new",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="assigned_beta_feedback",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="beta_feedback_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="betafeedback",
            index=models.Index(fields=["status", "-created_at"], name="operations__status_6a0f2d_idx"),
        ),
        migrations.AddIndex(
            model_name="betafeedback",
            index=models.Index(fields=["app_type", "severity"], name="operations__app_ty_5c8b91_idx"),
        ),
    ]
