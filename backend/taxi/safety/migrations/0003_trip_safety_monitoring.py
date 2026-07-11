from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("safety", "0002_safetyincident_delivery_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("rides", "0019_ride_no_show_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="TripLocationPing",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("latitude", models.FloatField()),
                ("longitude", models.FloatField()),
                ("accuracy_meters", models.FloatField(blank=True, null=True)),
                ("speed_mps", models.FloatField(blank=True, null=True)),
                ("source", models.CharField(default="client", max_length=20)),
                ("recorded_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "ride",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="safety_location_pings",
                        to="rides.ride",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="trip_location_pings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["recorded_at"],
                "indexes": [
                    models.Index(fields=["ride", "recorded_at"], name="safety_ping_ride_time_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="TripSafetyEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("long_stop", "Long Stop"),
                            ("route_deviation", "Route Deviation"),
                            ("safety_check", "Safety Check"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("responded_safe", "Responded Safe"),
                            ("escalated", "Escalated"),
                            ("dismissed", "Dismissed"),
                        ],
                        default="open",
                        max_length=20,
                    ),
                ),
                ("message", models.CharField(blank=True, default="", max_length=255)),
                ("latitude", models.FloatField(blank=True, null=True)),
                ("longitude", models.FloatField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "ride",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="safety_events",
                        to="rides.ride",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="trip_safety_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["ride", "status"], name="safety_event_ride_status_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="SafetyResponseLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("acknowledged", "Acknowledged"),
                            ("investigating", "Investigating"),
                            ("contacted_user", "Contacted User"),
                            ("contacted_emergency", "Contacted Emergency Services"),
                            ("resolved", "Resolved"),
                            ("dismissed", "Dismissed"),
                            ("marked_paid", "Marked Paid"),
                        ],
                        max_length=30,
                    ),
                ),
                ("note", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="safety_response_actions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "incident",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="response_logs",
                        to="safety.safetyincident",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
