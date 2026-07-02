from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("notifications", "0002_devicetoken"),
    ]

    operations = [
        migrations.CreateModel(
            name="FCMToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.TextField(unique=True)),
                ("device_type", models.CharField(choices=[("android", "Android"), ("ios", "iOS"), ("web", "Web")], default="android", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="fcm_tokens", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "FCM Token",
                "verbose_name_plural": "FCM Tokens",
            },
        ),
    ]
