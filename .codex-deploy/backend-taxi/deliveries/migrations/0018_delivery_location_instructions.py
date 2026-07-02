from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0017_delivery_chat_moderation"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="dropoff_instructions",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="delivery",
            name="pickup_instructions",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="delivery",
            name="recipient_alt_phone",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
