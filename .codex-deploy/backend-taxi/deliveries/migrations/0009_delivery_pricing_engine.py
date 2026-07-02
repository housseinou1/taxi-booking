from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0008_delivery_lifecycle"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="package_size_surcharge",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="surge_surcharge",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="night_surcharge",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="waiting_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="heavy_surcharge",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="delivery",
            name="courier_multiplier",
            field=models.DecimalField(decimal_places=2, default=1.2, max_digits=4),
        ),
        migrations.AddField(
            model_name="delivery",
            name="promo_code",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="delivery",
            name="pricing_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="delivery",
            name="package_type",
            field=models.CharField(
                choices=[
                    ("document", "Document"),
                    ("small", "Small Package"),
                    ("medium", "Medium Package"),
                    ("large", "Large Package"),
                    ("extra_large", "Extra Large Package"),
                ],
                default="small",
                max_length=20,
            ),
        ),
    ]
