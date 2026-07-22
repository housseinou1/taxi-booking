# Phase 33 — free delivery promo type + campaign label

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("promotions", "0003_promocode_city"),
    ]

    operations = [
        migrations.AddField(
            model_name="promocode",
            name="campaign_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("general", "General"),
                    ("first_ride", "First Ride Offer"),
                    ("free_delivery", "Free Delivery"),
                    ("city_campaign", "City Campaign"),
                    ("loyalty_exclusive", "Loyalty Exclusive"),
                ],
                default="general",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="promocode",
            name="discount_type",
            field=models.CharField(
                choices=[
                    ("percentage", "Percentage Off"),
                    ("fixed", "Fixed Amount Off"),
                    ("free_ride", "Free Ride"),
                    ("free_delivery", "Free Delivery"),
                ],
                max_length=20,
            ),
        ),
    ]
