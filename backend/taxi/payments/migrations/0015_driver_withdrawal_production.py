from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0014_platformwithdrawalaccounts"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="platformwithdrawalaccounts",
            name="masravi_number",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AlterField(
            model_name="driverpayoutmethod",
            name="payout_type",
            field=models.CharField(
                choices=[
                    ("bank_account", "Bank Account"),
                    ("card", "Card"),
                    ("bankily", "Bankily"),
                    ("masrvi", "Masravi"),
                    ("seddad", "Seddad"),
                ],
                default="bankily",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="withdrawalrequest",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("paid", "Paid"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="approved_withdrawals",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="paid_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="paid_withdrawals",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="withdrawalrequest",
            name="otp_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="WithdrawalOTPCode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="withdrawal_otp_codes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["user", "-created_at"], name="withdrawal_otp_user_idx"),
                ],
            },
        ),
        migrations.AddIndex(
            model_name="withdrawalrequest",
            index=models.Index(fields=["driver", "status"], name="withdrawal_driver_status_idx"),
        ),
        migrations.AlterField(
            model_name="wallettransaction",
            name="transaction_type",
            field=models.CharField(
                choices=[
                    ("top_up", "Top Up"),
                    ("ride_payment", "Ride Payment"),
                    ("ride_earning", "Ride Earning"),
                    ("tip", "Tip"),
                    ("delivery_payment", "Delivery Payment"),
                    ("merchant_payment", "Merchant Order Payment"),
                    ("courier_earning", "Courier Earning"),
                    ("merchant_earning", "Merchant Earning"),
                    ("payout", "Payout"),
                    ("withdrawal", "Withdrawal"),
                    ("refund", "Refund"),
                    ("referral", "Referral Reward"),
                    ("bonus", "Bonus"),
                    ("no_show", "Rider No-Show Compensation"),
                    ("adjustment", "Admin Adjustment"),
                ],
                max_length=20,
            ),
        ),
    ]
