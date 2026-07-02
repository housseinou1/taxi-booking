from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("drivers", "0007_mauritania_driver_documents")]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="application_rejection_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]
