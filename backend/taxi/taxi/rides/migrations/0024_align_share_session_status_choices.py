from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rides", "0023_ridepricingsnapshot_app_fee_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shareridesession",
            name="status",
            field=models.CharField(
                choices=[
                    ("requested", "Requested"),
                    ("matching", "Matching"),
                    ("driver_assigned", "Driver Assigned"),
                    ("driver_arriving", "Driver Arriving"),
                    ("passenger_pickup", "Passenger Pickup"),
                    ("additional_pickup", "Additional Pickup"),
                    ("in_progress", "In Progress"),
                    ("drop_off_stop", "Drop-off Stop"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="matching",
                max_length=30,
            ),
        ),
    ]
