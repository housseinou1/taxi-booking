# Phase 31 — Yala Merchant Platform

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("merchants", "0003_merchant_electronic_signature"),
    ]

    operations = [
        migrations.AddField(
            model_name="merchant",
            name="opening_hours",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="merchant",
            name="delivery_radius_km",
            field=models.FloatField(default=8.0),
        ),
        migrations.AddField(
            model_name="merchant",
            name="commission_rate",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text="Override merchant goods share (e.g. 0.90). Null uses platform default.",
                max_digits=5,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="merchantorder",
            name="courier_assigned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="merchantorder",
            name="status",
            field=models.CharField(
                choices=[
                    ("new_order", "New Order"),
                    ("accepted", "Accepted"),
                    ("preparing", "Preparing"),
                    ("ready_for_pickup", "Ready for Pickup"),
                    ("courier_assigned", "Courier Assigned"),
                    ("picked_up", "Picked Up"),
                    ("delivered", "Delivered"),
                    ("cancelled", "Cancelled"),
                ],
                default="new_order",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="MenuCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True, default="")),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="menu_categories",
                        to="merchants.merchant",
                    ),
                ),
            ],
            options={"ordering": ["sort_order", "name"]},
        ),
        migrations.AddField(
            model_name="product",
            name="menu_category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="products",
                to="merchants.menucategory",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="product_kind",
            field=models.CharField(
                choices=[
                    ("general", "General"),
                    ("food", "Food"),
                    ("medicine", "Medicine"),
                    ("otc", "OTC"),
                    ("grocery", "Grocery"),
                ],
                default="general",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="requires_prescription",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="product",
            name="weight_kg",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=8, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="price_per_kg",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="sort_order",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="ProductVariant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("price_delta", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10)),
                ("is_available", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="variants",
                        to="merchants.product",
                    ),
                ),
            ],
            options={"ordering": ["sort_order", "name"]},
        ),
        migrations.CreateModel(
            name="ProductExtra",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("price", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10)),
                ("is_available", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="extras",
                        to="merchants.product",
                    ),
                ),
            ],
            options={"ordering": ["sort_order", "name"]},
        ),
        migrations.CreateModel(
            name="MerchantSettlement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("paid", "Paid"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("gross_sales", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("commission_amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("net_payout", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("order_count", models.PositiveIntegerField(default=0)),
                ("invoice_reference", models.CharField(blank=True, default="", max_length=64)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="settlements",
                        to="merchants.merchant",
                    ),
                ),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="approved_merchant_settlements",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-period_end"]},
        ),
    ]
