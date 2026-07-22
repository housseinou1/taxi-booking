# Phase 33 — merchant referral support

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("merchants", "0004_merchant_platform_phase31"),
        ("referrals", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MerchantReferralCode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(db_index=True, max_length=8, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "merchant",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="referral_code_record",
                        to="merchants.merchant",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="MerchantReferral",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("completed", "Completed"),
                            ("expired", "Expired"),
                            ("revoked", "Revoked"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "reward_status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("issued", "Issued"),
                            ("expired", "Expired"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("reward_amount", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(null=True, blank=True)),
                (
                    "referral_code",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="referrals",
                        to="referrals.merchantreferralcode",
                    ),
                ),
                (
                    "referred_merchant",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="merchant_referral_as_referee",
                        to="merchants.merchant",
                    ),
                ),
            ],
        ),
    ]
