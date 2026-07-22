from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("merchants", "0004_merchant_platform_phase31"),
    ]

    operations = [
        migrations.AddField(
            model_name="merchantorder",
            name="destination_lat",
            field=models.FloatField(default=18.0896),
        ),
        migrations.AddField(
            model_name="merchantorder",
            name="destination_lng",
            field=models.FloatField(default=-15.9754),
        ),
    ]
