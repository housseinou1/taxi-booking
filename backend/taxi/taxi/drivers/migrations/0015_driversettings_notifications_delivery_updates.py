from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("drivers", "0014_alter_driverdocument_document_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="driversettings",
            name="notifications_delivery_updates",
            field=models.BooleanField(default=True),
        ),
    ]
