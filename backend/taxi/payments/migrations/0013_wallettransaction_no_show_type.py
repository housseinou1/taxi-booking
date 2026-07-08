# Generated manually for rider no-show wallet credit type.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0012_payment_wallet_system"),
    ]

    operations = [
        migrations.AlterField(
            model_name="wallettransaction",
            name="transaction_type",
            field=models.CharField(
                choices=[
                    ("top_up", "Top Up"),
                    ("ride_payment", "Ride Payment"),
                    ("delivery_payment", "Delivery Payment"),
                    ("merchant_payment", "Merchant Order Payment"),
                    ("courier_earning", "Courier Earning"),
                    ("merchant_earning", "Merchant Earning"),
                    ("payout", "Payout"),
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
