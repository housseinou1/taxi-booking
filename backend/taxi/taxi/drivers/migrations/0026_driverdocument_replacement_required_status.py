from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0025_driver_suspension_state"),
    ]

    operations = [
        migrations.AlterField(
            model_name="driverdocument",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending_review", "Pending Review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("replacement_required", "Replacement Required"),
                ],
                default="pending_review",
                max_length=20,
            ),
        ),
    ]
