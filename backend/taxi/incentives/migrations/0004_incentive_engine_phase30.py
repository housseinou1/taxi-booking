# Generated for Phase 30 — Driver Incentive Engine

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("incentives", "0003_delivery_count_incentive"),
        ("payments", "0020_rc3_stabilization_indexes"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="incentiveprogram",
            name="reward_type",
            field=models.CharField(
                choices=[
                    ("fixed", "Fixed Amount"),
                    ("percentage", "Percentage"),
                    ("per_trip", "Per Trip"),
                ],
                default="fixed",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="incentiveprogram",
            name="eligible_groups",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="incentiveprogram",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="incentiveprogram",
            name="incentive_type",
            field=models.CharField(
                choices=[
                    ("ride_count", "Complete X Rides"),
                    ("peak_hours", "Work During Peak Hours"),
                    ("consecutive_days", "Drive X Consecutive Days"),
                    ("rating", "Maintain High Rating"),
                    ("city_bonus", "Drive in Specific City"),
                    ("weekly_target", "Weekly Earnings Target"),
                    ("first_ride_bonus", "First Ride of the Day"),
                    ("intercity", "Complete Intercity Trip"),
                    ("seasonal", "Seasonal Bonus"),
                    ("holiday", "Holiday Bonus"),
                    ("delivery_count", "Complete X Deliveries"),
                    ("daily_trip_target", "Daily Trip Target"),
                    ("weekly_trip_target", "Weekly Trip Target"),
                    ("peak_hour_bonus", "Peak-Hour Bonus"),
                    ("weekend_bonus", "Weekend Bonus"),
                    ("airport_bonus", "Airport Bonus"),
                    ("new_driver_bonus", "New Driver Bonus"),
                    ("referral_bonus", "Referral Bonus"),
                    ("consecutive_trips_bonus", "Consecutive Trips Bonus"),
                ],
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="incentiveprogram",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("active", "Active"),
                    ("paused", "Paused"),
                    ("completed", "Completed"),
                    ("expired", "Expired"),
                ],
                default="draft",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="driverincentiveprogress",
            name="pending_bonus",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10),
        ),
        migrations.AddField(
            model_name="driverincentiveprogress",
            name="qualifying_earnings",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="bonuspayment",
            name="payout_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("paid", "Paid"),
                    ("rejected", "Rejected"),
                ],
                db_index=True,
                default="pending",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="bonuspayment",
            name="progress",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="bonus_payments",
                to="incentives.driverincentiveprogress",
            ),
        ),
        migrations.AddField(
            model_name="bonuspayment",
            name="wallet_transaction",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="incentive_bonuses",
                to="payments.wallettransaction",
            ),
        ),
        migrations.AddField(
            model_name="bonuspayment",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="approved_bonus_payments",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="bonuspayment",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
