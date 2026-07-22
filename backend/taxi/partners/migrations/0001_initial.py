# Generated manually for Phase 32 Partner & Franchise Platform

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("locations", "0004_repair_missing_location_tables"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Partner",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("partner_name", models.CharField(max_length=200)),
                ("company", models.CharField(blank=True, default="", max_length=200)),
                ("contact_person", models.CharField(max_length=150)),
                ("phone", models.CharField(max_length=30)),
                ("email", models.EmailField(max_length=254)),
                ("territory_label", models.CharField(blank=True, default="", max_length=200)),
                (
                    "contract_status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("suspended", "Suspended"),
                            ("terminated", "Terminated"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "revenue_share",
                    models.DecimalField(
                        decimal_places=4,
                        default=0.7,
                        help_text="Partner share of net revenue (e.g. 0.70 = 70%).",
                        max_digits=5,
                    ),
                ),
                ("start_date", models.DateField(blank=True, null=True)),
                ("end_date", models.DateField(blank=True, null=True)),
                ("suspension_reason", models.TextField(blank=True, default="")),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "admin_user",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="partner_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "city",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="partners",
                        to="locations.city",
                    ),
                ),
                (
                    "regional_director",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="managed_partners",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PartnerTerritory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("zone_name", models.CharField(default="Primary", max_length=120)),
                (
                    "service_boundary",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Geo bounds: {north, south, east, west} or polygon coordinates.",
                    ),
                ),
                ("allow_overlap", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "city",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="partner_territories",
                        to="locations.city",
                    ),
                ),
                (
                    "partner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="territories",
                        to="partners.partner",
                    ),
                ),
            ],
            options={"ordering": ["city__name", "zone_name"], "verbose_name_plural": "Partner territories"},
        ),
        migrations.CreateModel(
            name="PartnerSettlement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "period_type",
                    models.CharField(
                        choices=[("weekly", "Weekly"), ("monthly", "Monthly")],
                        default="weekly",
                        max_length=10,
                    ),
                ),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("gross_revenue", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("platform_commission", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("partner_payout", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("order_count", models.PositiveIntegerField(default=0)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("paid", "Paid"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("invoice_reference", models.CharField(blank=True, default="", max_length=64)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="approved_partner_settlements",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "partner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="settlements",
                        to="partners.partner",
                    ),
                ),
            ],
            options={"ordering": ["-period_end", "-created_at"]},
        ),
    ]
