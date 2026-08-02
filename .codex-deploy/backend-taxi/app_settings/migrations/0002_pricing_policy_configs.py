# Generated for Mission 16 Commit 2 — database-backed pricing policy models.
# Safe on production data: all fields have defaults or are nullable.
# Reversible: all CreateModel operations can be rolled back.

import decimal
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_settings", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── GlobalFareConfig ─────────────────────────────────────────────
        migrations.CreateModel(
            name="GlobalFareConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("effective_from", models.DateTimeField(
                    blank=True,
                    db_index=True,
                    default=django.utils.timezone.now,
                    help_text="When this configuration becomes effective.",
                    null=True,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("ride_type", models.CharField(
                    choices=[
                        ("Regular", "Regular"),
                        ("XL", "XL"),
                        ("Comfort", "Comfort"),
                        ("Share", "Share"),
                    ],
                    db_index=True,
                    max_length=20,
                )),
                ("base_fare", models.DecimalField(
                    decimal_places=2,
                    default=decimal.Decimal("0.00"),
                    help_text="Base and minimum fare for the ride type.",
                    max_digits=10,
                )),
                ("per_km", models.DecimalField(
                    decimal_places=2,
                    default=decimal.Decimal("0.00"),
                    help_text="Per-kilometer charge.",
                    max_digits=10,
                )),
                ("minimum_fare", models.DecimalField(
                    decimal_places=2,
                    default=decimal.Decimal("0.00"),
                    help_text="Minimum payable fare for the ride type.",
                    max_digits=10,
                )),
                ("created_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="globalfareconfig_created",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="globalfareconfig_updated",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-effective_from", "-created_at"], "abstract": False},
        ),
        migrations.AddIndex(
            model_name="globalfareconfig",
            index=models.Index(fields=["ride_type", "is_active"], name="idx_gf_ride_active"),
        ),
        migrations.AddIndex(
            model_name="globalfareconfig",
            index=models.Index(fields=["effective_from"], name="idx_gf_effective"),
        ),
        migrations.AddConstraint(
            model_name="globalfareconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=["ride_type"],
                name="uq_gf_active",
            ),
        ),

        # ── WaitingFeeConfig ─────────────────────────────────────────────
        migrations.CreateModel(
            name="WaitingFeeConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("effective_from", models.DateTimeField(
                    blank=True, db_index=True, default=django.utils.timezone.now,
                    help_text="When this configuration becomes effective.", null=True,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("free_minutes", models.PositiveSmallIntegerField(
                    default=3, help_text="Free waiting minutes before billing starts.",
                )),
                ("per_minute_fee", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("max_wait_minutes", models.PositiveSmallIntegerField(
                    default=5, help_text="Maximum waiting minutes before no-show becomes available.",
                )),
                ("arrive_max_distance_m", models.PositiveSmallIntegerField(
                    default=350, help_text="GPS radius for driver 'arrived' validation.",
                )),
                ("no_show_max_distance_m", models.PositiveSmallIntegerField(
                    default=150, help_text="GPS radius for rider no-show validation.",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="waitingfeeconfig_created", to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="waitingfeeconfig_updated", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-effective_from", "-created_at"], "abstract": False},
        ),
        migrations.AddIndex(
            model_name="waitingfeeconfig",
            index=models.Index(fields=["is_active", "effective_from"], name="idx_wf_active_eff"),
        ),
        migrations.AddConstraint(
            model_name="waitingfeeconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=["is_active"],
                name="uq_wf_active",
            ),
        ),

        # ── CancellationFeeConfig ────────────────────────────────────────
        migrations.CreateModel(
            name="CancellationFeeConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("effective_from", models.DateTimeField(
                    blank=True, db_index=True, default=django.utils.timezone.now,
                    help_text="When this configuration becomes effective.", null=True,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("free_window_minutes", models.PositiveSmallIntegerField(
                    default=2, help_text="Free cancellation window from ride creation.",
                )),
                ("en_route_fee", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("arrived_fee", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("driver_penalty", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="cancellationfeeconfig_created", to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="cancellationfeeconfig_updated", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-effective_from", "-created_at"], "abstract": False},
        ),
        migrations.AddIndex(
            model_name="cancellationfeeconfig",
            index=models.Index(fields=["is_active", "effective_from"], name="idx_cf_active_eff"),
        ),
        migrations.AddConstraint(
            model_name="cancellationfeeconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=["is_active"],
                name="uq_cf_active",
            ),
        ),

        # ── NoShowFeeConfig ──────────────────────────────────────────────
        migrations.CreateModel(
            name="NoShowFeeConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("effective_from", models.DateTimeField(
                    blank=True, db_index=True, default=django.utils.timezone.now,
                    help_text="When this configuration becomes effective.", null=True,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("rider_fee", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("driver_compensation", models.DecimalField(
                    decimal_places=2, default=decimal.Decimal("0.00"), max_digits=10,
                )),
                ("wait_minutes_threshold", models.PositiveSmallIntegerField(
                    default=5, help_text="Minimum wait minutes before a no-show can be valid.",
                )),
                ("max_distance_m", models.PositiveSmallIntegerField(
                    default=150, help_text="GPS radius for no-show validation.",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="noshowfeeconfig_created", to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="noshowfeeconfig_updated", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-effective_from", "-created_at"], "abstract": False},
        ),
        migrations.AddIndex(
            model_name="noshowfeeconfig",
            index=models.Index(fields=["is_active", "effective_from"], name="idx_ns_active_eff"),
        ),
        migrations.AddConstraint(
            model_name="noshowfeeconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=["is_active"],
                name="uq_ns_active",
            ),
        ),

        # ── RideCommissionConfig ─────────────────────────────────────────
        migrations.CreateModel(
            name="RideCommissionConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("effective_from", models.DateTimeField(
                    blank=True, db_index=True, default=django.utils.timezone.now,
                    help_text="When this configuration becomes effective.", null=True,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("platform_percent", models.DecimalField(
                    decimal_places=4,
                    default=decimal.Decimal("0.3000"),
                    help_text="Platform commission as a decimal (e.g., 0.30 for 30%).",
                    max_digits=5,
                )),
                ("driver_percent", models.DecimalField(
                    decimal_places=4,
                    default=decimal.Decimal("0.7000"),
                    help_text="Driver share as a decimal.",
                    max_digits=5,
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="ridecommissionconfig_created", to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="ridecommissionconfig_updated", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-effective_from", "-created_at"], "abstract": False},
        ),
        migrations.AddIndex(
            model_name="ridecommissionconfig",
            index=models.Index(fields=["is_active", "effective_from"], name="idx_rc_active_eff"),
        ),
        migrations.AddConstraint(
            model_name="ridecommissionconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=["is_active"],
                name="uq_rc_active",
            ),
        ),
    ]
