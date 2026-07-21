# Generated manually for Phase 15 launch preparation models.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0003_airecommendation"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="OpsIncident",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(db_index=True, max_length=32, unique=True)),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "severity",
                    models.CharField(
                        choices=[
                            ("critical", "Critical"),
                            ("high", "High"),
                            ("medium", "Medium"),
                            ("low", "Low"),
                        ],
                        db_index=True,
                        default="medium",
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("investigating", "Investigating"),
                            ("mitigated", "Mitigated"),
                            ("resolved", "Resolved"),
                        ],
                        db_index=True,
                        default="open",
                        max_length=20,
                    ),
                ),
                ("root_cause", models.TextField(blank=True, default="")),
                ("resolution", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_ops_incidents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="owned_ops_incidents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="LaunchAlert",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "alert_type",
                    models.CharField(
                        choices=[
                            ("api_offline", "API Offline"),
                            ("redis_offline", "Redis Offline"),
                            ("database_offline", "Database Offline"),
                            ("celery_stopped", "Celery Stopped"),
                            ("high_error_rate", "High Error Rate"),
                            ("high_cancellation_rate", "High Cancellation Rate"),
                            ("large_withdrawal_queue", "Large Withdrawal Queue"),
                            ("sos_event", "SOS Event"),
                            ("expired_documents", "Expired Documents"),
                            ("failed_payments", "Failed Payments"),
                            ("other", "Other"),
                        ],
                        db_index=True,
                        max_length=40,
                    ),
                ),
                (
                    "severity",
                    models.CharField(
                        choices=[
                            ("critical", "Critical"),
                            ("high", "High"),
                            ("medium", "Medium"),
                            ("low", "Low"),
                        ],
                        default="medium",
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("acknowledged", "Acknowledged"),
                            ("resolved", "Resolved"),
                        ],
                        db_index=True,
                        default="active",
                        max_length=20,
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("message", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "acknowledged_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="acknowledged_launch_alerts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="OpsIncidentEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("note", "Note"),
                            ("status_change", "Status Change"),
                            ("assignment", "Assignment"),
                            ("root_cause", "Root Cause"),
                            ("resolution", "Resolution"),
                        ],
                        default="note",
                        max_length=20,
                    ),
                ),
                ("message", models.TextField()),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ops_incident_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "incident",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="operations.opsincident",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="opsincident",
            index=models.Index(fields=["status", "severity", "-created_at"], name="operations__status_6a0f6d_idx"),
        ),
        migrations.AddIndex(
            model_name="launchalert",
            index=models.Index(fields=["status", "alert_type", "-created_at"], name="operations__status_0d8caa_idx"),
        ),
    ]
