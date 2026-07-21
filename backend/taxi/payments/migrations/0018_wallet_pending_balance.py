from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0017_driverpayoutmethod_verification"),
    ]

    operations = [
        migrations.AddField(
            model_name="walletaccount",
            name="pending_balance",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="wallettransaction",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("completed", "Completed"),
                    ("reversed", "Reversed"),
                ],
                default="completed",
                max_length=20,
            ),
        ),
    ]
