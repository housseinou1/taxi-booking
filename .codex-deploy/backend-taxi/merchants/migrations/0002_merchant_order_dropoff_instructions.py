from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("merchants", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="merchantorder",
            name="dropoff_instructions",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="merchantorder",
            name="recipient_alt_phone",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
