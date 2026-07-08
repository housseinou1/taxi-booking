from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AdminTOTP",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="admin_totp",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("secret", models.CharField(max_length=64)),
                ("is_confirmed", models.BooleanField(default=False)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"verbose_name": "Admin TOTP"},
        ),
    ]
