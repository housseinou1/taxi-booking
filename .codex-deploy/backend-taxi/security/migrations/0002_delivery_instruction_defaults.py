from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("security", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customersavedaddress",
            name="apartment_floor",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="customersavedaddress",
            name="building_description",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="customersavedaddress",
            name="extra_instructions",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="customersavedaddress",
            name="gate_color",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="customersavedaddress",
            name="landmark",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="customersavedaddress",
            name="recipient_alt_phone",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.CreateModel(
            name="CustomerDeliveryDefaults",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("building_description", models.CharField(blank=True, default="", max_length=200)),
                ("apartment_floor", models.CharField(blank=True, default="", max_length=80)),
                ("landmark", models.CharField(blank=True, default="", max_length=200)),
                ("gate_color", models.CharField(blank=True, default="", max_length=40)),
                ("extra_instructions", models.TextField(blank=True, default="")),
                ("recipient_alt_phone", models.CharField(blank=True, default="", max_length=30)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_defaults",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
