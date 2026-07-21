from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0016_withdrawal_idempotency_reference"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverpayoutmethod",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddField(
            model_name="driverpayoutmethod",
            name="is_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverpayoutmethod",
            name="verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
