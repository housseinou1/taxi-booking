# Generated for Mission 16 Commit 2 — immutable pricing snapshot for rides.
#
# Design notes:
#   • OneToOneField on Ride — one snapshot per ride, enforced at the DB level.
#   • All FK fields to policy configs are nullable so legacy rides (no snapshot)
#     and rides created before a policy existed are safe.
#   • No data migration: historical rides keep their existing fare values.
#   • Index on (ride) for fast admin and service lookups.
#   • Index on (source) for analytics queries.
#   • Reversible.

import decimal
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0014_ride_cancellation_fee_ride_cancellation_reason_and_more"),
        ("app_settings", "0002_pricing_policy_configs"),
        ("locations", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RidePricingSnapshot",
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
                (
                    "ride",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pricing_snapshot",
                        to="rides.ride",
                    ),
                ),
                ("ride_type", models.CharField(max_length=20)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("city", "City Override"),
                            ("global_db", "Global DB"),
                            ("market_fallback", "Market Fallback"),
                        ],
                        default="market_fallback",
                        max_length=20,
                    ),
                ),
                (
                    "city_pricing",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots",
                        to="locations.citypricing",
                    ),
                ),
                (
                    "global_fare_config",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots",
                        to="app_settings.globalfareconfig",
                    ),
                ),
                ("base_fare", models.DecimalField(decimal_places=2, max_digits=10)),
                ("per_km", models.DecimalField(decimal_places=2, max_digits=10)),
                ("minimum_fare", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "billable_distance_km",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        max_digits=6,
                    ),
                ),
                (
                    "distance_charge",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        max_digits=10,
                    ),
                ),
                ("estimated_fare", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "commission_percent",
                    models.DecimalField(
                        decimal_places=4,
                        default=decimal.Decimal("0.3000"),
                        help_text="Platform commission share at ride creation.",
                        max_digits=5,
                    ),
                ),
                (
                    "waiting_policy",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots",
                        to="app_settings.waitingfeeconfig",
                    ),
                ),
                (
                    "cancellation_policy",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots_cancellation",
                        to="app_settings.cancellationfeeconfig",
                    ),
                ),
                (
                    "no_show_policy",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots_no_show",
                        to="app_settings.noshowfeeconfig",
                    ),
                ),
                (
                    "commission_policy",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ride_snapshots_commission",
                        to="app_settings.ridecommissionconfig",
                    ),
                ),
                (
                    "app_fee",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        max_digits=10,
                    ),
                ),
                (
                    "driver_earning",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        max_digits=10,
                    ),
                ),
                (
                    "effective_from",
                    models.DateTimeField(
                        blank=True,
                        help_text="Earliest effective timestamp of the applied configurations.",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddIndex(
            model_name="ridepricingsnapshot",
            index=models.Index(fields=["ride"], name="ride_snapshot_ride_idx"),
        ),
        migrations.AddIndex(
            model_name="ridepricingsnapshot",
            index=models.Index(fields=["source"], name="ride_snapshot_source_idx"),
        ),
    ]
