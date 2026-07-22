# Yala Business Accounts — Phase 23

from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def approve_existing_accounts(apps, schema_editor):
    CorporateAccount = apps.get_model("features", "CorporateAccount")
    CorporateAccount.objects.filter(is_active=True).update(status="approved")
    CorporateAccount.objects.filter(is_active=False).update(status="suspended")


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("features", "0002_airportpickup_service_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="corporateaccount",
            name="commercial_registration",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="corporateaccount",
            name="tax_id",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="corporateaccount",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="corporateaccount",
            name="billing_email",
            field=models.EmailField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="corporateaccount",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("suspended", "Suspended"),
                ],
                db_index=True,
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="corporateaccount",
            name="admin_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="managed_corporate_accounts",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="corporateemployee",
            name="role",
            field=models.CharField(
                choices=[("admin", "Admin"), ("employee", "Employee")],
                default="employee",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="corporateemployee",
            name="cost_center",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="corporateemployee",
            name="ride_limit",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Maximum completed rides per month (optional).",
                null=True,
            ),
        ),
        migrations.RunPython(approve_existing_accounts, migrations.RunPython.noop),
    ]
