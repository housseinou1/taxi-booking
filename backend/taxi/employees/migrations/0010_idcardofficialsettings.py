# Generated for Employee ID Card official CEO signature settings.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("employees", "0009_alter_breaknotification_kind"),
    ]

    operations = [
        migrations.CreateModel(
            name="IdCardOfficialSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "ceo_signature_key",
                    models.CharField(blank=True, default="", max_length=80),
                ),
                ("authorized_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "authorized_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "ID card official settings",
                "verbose_name_plural": "ID card official settings",
            },
        ),
    ]
