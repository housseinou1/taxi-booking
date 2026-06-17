from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0012_add_document_status_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="vehicle_photo",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="drivers/vehicles/",
            ),
        ),
    ]
