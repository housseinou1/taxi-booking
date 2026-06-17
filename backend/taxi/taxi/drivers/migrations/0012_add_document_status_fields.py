from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0011_halloffamerecognition"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="license_status",
            field=models.CharField(
                choices=[("pending", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("expired", "Expired")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="license_rejection_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="insurance_status",
            field=models.CharField(
                choices=[("pending", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("expired", "Expired")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="insurance_rejection_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="vignette_status",
            field=models.CharField(
                choices=[("pending", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("expired", "Expired")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="vignette_rejection_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="registration_status",
            field=models.CharField(
                choices=[("pending", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("expired", "Expired")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="registration_rejection_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="photo_status",
            field=models.CharField(
                choices=[("pending", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("expired", "Expired")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="photo_rejection_note",
            field=models.TextField(blank=True, default=""),
        ),
    ]
