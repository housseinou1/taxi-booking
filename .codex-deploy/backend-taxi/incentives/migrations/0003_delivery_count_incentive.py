from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("incentives", "0002_alter_incentiveprogram_incentive_type"),
    ]

    operations = [
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
                ],
                max_length=30,
            ),
        ),
    ]
