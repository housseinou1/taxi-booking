# Generated manually for Phase 13 AI Operations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0002_platformsetting"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIRecommendation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("reposition", "Reposition Drivers"),
                            ("surge", "Surge Zone"),
                            ("contact_driver", "Contact Driver"),
                            ("add_couriers", "Add Couriers"),
                            ("review_account", "Review Account"),
                            ("incentive", "Increase Incentive"),
                            ("fleet_health", "Fleet Health"),
                            ("financial", "Financial Insight"),
                            ("other", "Other"),
                        ],
                        default="other",
                        max_length=30,
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("summary", models.TextField()),
                ("explanation", models.JSONField(blank=True, default=dict)),
                ("zone_lat", models.FloatField(blank=True, null=True)),
                ("zone_lng", models.FloatField(blank=True, null=True)),
                ("related_driver_id", models.IntegerField(blank=True, null=True)),
                ("related_ride_id", models.IntegerField(blank=True, null=True)),
                ("related_delivery_id", models.IntegerField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("dismissed", "Dismissed"),
                            ("completed", "Completed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "reviewed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ai_recommendations_reviewed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="airecommendation",
            index=models.Index(fields=["status", "-created_at"], name="operations__status_8a1b2c_idx"),
        ),
        migrations.AddIndex(
            model_name="airecommendation",
            index=models.Index(fields=["category", "status"], name="operations__categor_3d4e5f_idx"),
        ),
    ]
