# Corporate invoice billing breakdown

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0007_betafeedback_support_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="corporateinvoice",
            name="subtotal",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="corporateinvoice",
            name="tax_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="corporateinvoice",
            name="tax_rate",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=5),
        ),
        migrations.AddField(
            model_name="corporateinvoice",
            name="invoice_frequency",
            field=models.CharField(
                choices=[
                    ("weekly", "Weekly"),
                    ("monthly", "Monthly"),
                    ("statement", "Ride Statement"),
                ],
                default="monthly",
                max_length=20,
            ),
        ),
    ]
