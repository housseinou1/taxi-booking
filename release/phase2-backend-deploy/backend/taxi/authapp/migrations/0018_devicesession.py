from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0017_passwordresetcode"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DeviceSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="device_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("device_id", models.CharField(db_index=True, max_length=128)),
                ("device_name", models.CharField(blank=True, default="", max_length=255)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("is_new_device", models.BooleanField(default=True)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-last_seen_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="devicesession",
            constraint=models.UniqueConstraint(fields=["user", "device_id"], name="device_sess_user_device_uniq"),
        ),
        migrations.AddIndex(
            model_name="devicesession",
            index=models.Index(fields=["user", "-last_seen_at"], name="device_sess_user_idx"),
        ),
    ]
