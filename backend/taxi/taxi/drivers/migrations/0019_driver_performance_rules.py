from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0018_driver_taxi_electronic_signature"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="total_rides_missed",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="total_rides_declined",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="performance_points",
            field=models.IntegerField(default=100),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="acceptance_rate_points",
            field=models.IntegerField(default=100),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="cancellations_today_count",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="cancellations_today_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="account_risk_flag",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="account_under_review",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="account_risk_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]
