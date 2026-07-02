from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0006_add_level_system_and_new_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverdocument",
            name="issued_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="license_issued_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="vignette_document",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to="drivers/vignettes/",
            ),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="vignette_expires_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="driverdocument",
            name="document_type",
            field=models.CharField(
                choices=[
                    ("license", "Driver License"),
                    ("national_id", "National ID"),
                    ("insurance", "Insurance"),
                    ("carte_grise", "Carte Grise"),
                    ("vignette", "Vignette"),
                    ("vehicle_registration", "Vehicle Registration (Legacy)"),
                    ("profile_photo", "Profile Photo"),
                ],
                max_length=30,
            ),
        ),
    ]
