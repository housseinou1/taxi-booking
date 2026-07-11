# Generated manually for platform withdrawal accounts configuration.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_platform_withdrawal_accounts(apps, schema_editor):
    PlatformWithdrawalAccounts = apps.get_model("payments", "PlatformWithdrawalAccounts")
    PlatformWithdrawalAccounts.objects.get_or_create(
        key="platform",
        defaults={
            "bank_account": "00018001002100252350150",
            "bankily_number": "22114373",
            "seddad_number": "22114373",
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0013_wallettransaction_no_show_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformWithdrawalAccounts",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(default="platform", max_length=32, unique=True)),
                ("bank_account", models.CharField(blank=True, default="", max_length=64)),
                ("bankily_number", models.CharField(blank=True, default="", max_length=32)),
                ("seddad_number", models.CharField(blank=True, default="", max_length=32)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="platform_withdrawal_account_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Platform withdrawal accounts",
                "verbose_name_plural": "Platform withdrawal accounts",
            },
        ),
        migrations.RunPython(seed_platform_withdrawal_accounts, migrations.RunPython.noop),
    ]
