# Generated manually — Phase 33 loyalty program

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


def seed_tiers(apps, schema_editor):
    LoyaltyTier = apps.get_model("loyalty", "LoyaltyTier")
    rows = [
        ("bronze", "Bronze", 0, Decimal("0"), Decimal("0"), False, False, 1),
        ("silver", "Silver", 500, Decimal("5"), Decimal("5"), False, False, 2),
        ("gold", "Gold", 2000, Decimal("10"), Decimal("10"), True, True, 3),
        ("platinum", "Platinum", 5000, Decimal("15"), Decimal("15"), True, True, 4),
    ]
    for slug, name, min_pts, ride_disc, del_disc, priority, exclusive, order in rows:
        LoyaltyTier.objects.update_or_create(
            slug=slug,
            defaults={
                "name": name,
                "min_points": min_pts,
                "ride_discount_percent": ride_disc,
                "delivery_discount_percent": del_disc,
                "priority_support": priority,
                "exclusive_promotions": exclusive,
                "sort_order": order,
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LoyaltyTier",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "slug",
                    models.CharField(
                        choices=[
                            ("bronze", "Bronze"),
                            ("silver", "Silver"),
                            ("gold", "Gold"),
                            ("platinum", "Platinum"),
                        ],
                        max_length=20,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=40)),
                ("min_points", models.PositiveIntegerField(default=0)),
                ("ride_discount_percent", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("delivery_discount_percent", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("priority_support", models.BooleanField(default=False)),
                ("exclusive_promotions", models.BooleanField(default=False)),
                ("benefits", models.JSONField(blank=True, default=dict)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["sort_order", "min_points"]},
        ),
        migrations.CreateModel(
            name="LoyaltyReward",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                (
                    "reward_type",
                    models.CharField(
                        choices=[
                            ("wallet_credit", "Wallet Credit"),
                            ("free_ride_coupon", "Free Ride Coupon"),
                            ("delivery_discount", "Delivery Discount"),
                            ("ride_discount", "Ride Discount"),
                        ],
                        max_length=30,
                    ),
                ),
                ("points_cost", models.PositiveIntegerField()),
                ("value", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "min_tier",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="rewards",
                        to="loyalty.loyaltytier",
                    ),
                ),
            ],
            options={"ordering": ["points_cost"]},
        ),
        migrations.CreateModel(
            name="RiderLoyaltyAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("points_balance", models.PositiveIntegerField(default=0)),
                ("lifetime_points", models.PositiveIntegerField(default=0)),
                ("enrolled_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "rider",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="loyalty_account",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "tier",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="members",
                        to="loyalty.loyaltytier",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="LoyaltyPointTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("points", models.IntegerField()),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("ride", "Completed Ride"),
                            ("delivery", "Completed Delivery"),
                            ("merchant_order", "Merchant Purchase"),
                            ("referral", "Referral"),
                            ("promo", "Promotion"),
                            ("redemption", "Redemption"),
                            ("adjustment", "Admin Adjustment"),
                        ],
                        max_length=20,
                    ),
                ),
                ("reference", models.CharField(blank=True, default="", max_length=120)),
                ("note", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transactions",
                        to="loyalty.riderloyaltyaccount",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.RunPython(seed_tiers, migrations.RunPython.noop),
    ]
