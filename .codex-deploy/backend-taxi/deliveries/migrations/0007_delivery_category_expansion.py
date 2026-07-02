from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0006_courier_type_and_statuses"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="food_items",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="delivery",
            name="pharmacy_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="delivery",
            name="prescription_photo",
            field=models.ImageField(blank=True, null=True, upload_to="deliveries/prescriptions/"),
        ),
        migrations.AddField(
            model_name="delivery",
            name="is_urgent",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="delivery",
            name="store_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="delivery",
            name="item_quantity",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="delivery",
            name="substitution_notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="delivery",
            name="is_secure_delivery",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="delivery",
            name="service_category",
            field=models.CharField(
                choices=[
                    ("food", "Food"),
                    ("pharmacy", "Pharmacy / Medicine"),
                    ("grocery", "Grocery"),
                    ("package", "Parcel"),
                    ("documents", "Documents"),
                    ("shopping", "Shopping"),
                    ("restaurant", "Restaurant Orders"),
                    ("market", "Market Delivery"),
                    ("household", "Water / Household"),
                    ("business", "Business Delivery"),
                    ("courier", "Courier"),
                ],
                default="package",
                max_length=20,
            ),
        ),
    ]
