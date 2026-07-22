# Generated manually for Phase 38 API key rotation

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api_gateway", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="apikey",
            name="grace_period_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="apikey",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="apikey",
            name="rotated_from",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="successor_keys",
                to="api_gateway.apikey",
            ),
        ),
    ]
