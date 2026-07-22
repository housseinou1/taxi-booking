# Corporate billing fields on rides

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("features", "0003_business_accounts"),
        ("rides", "0020_smart_dispatch"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="billing_source",
            field=models.CharField(
                choices=[("personal", "Personal"), ("corporate", "Corporate")],
                db_index=True,
                default="personal",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="corporate_account",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="rides",
                to="features.corporateaccount",
            ),
        ),
        migrations.AddField(
            model_name="ride",
            name="cost_center",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
