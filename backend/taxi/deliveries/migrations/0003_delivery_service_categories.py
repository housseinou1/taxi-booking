from django.db import migrations, models


def migrate_legacy_categories(apps, schema_editor):
    Delivery = apps.get_model("deliveries", "Delivery")
    Delivery.objects.filter(service_category="document").update(service_category="courier")
    Delivery.objects.filter(service_category="shopping").update(service_category="courier")


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0002_yala_delivery_expansion"),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_categories, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="delivery",
            name="service_category",
            field=models.CharField(
                choices=[
                    ("food", "Food"),
                    ("courier", "Courier"),
                    ("package", "Packages"),
                    ("pharmacy", "Pharmacy Medicines"),
                ],
                default="package",
                max_length=20,
            ),
        ),
    ]
