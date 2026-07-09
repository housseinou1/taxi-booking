from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0019_driver_performance_rules"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="total_rides_no_show",
            field=models.IntegerField(default=0),
        ),
    ]
