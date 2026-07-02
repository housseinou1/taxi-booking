from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0015_delivery_message"),
    ]

    operations = [
        migrations.AlterField(
            model_name="deliverymessage",
            name="message",
            field=models.TextField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="deliverymessage",
            name="image",
            field=models.ImageField(blank=True, null=True, upload_to="deliveries/chat/"),
        ),
    ]
