from django.db import migrations, models


def migrate_legacy_payment_methods(apps, schema_editor):
    Delivery = apps.get_model("deliveries", "Delivery")
    MerchantOrder = apps.get_model("merchants", "MerchantOrder")
    mapping = {
        "cash": "card",
        "wallet": "card",
        "masrvi": "masravi",
        "seddad": "sedad",
    }
    for model in (Delivery, MerchantOrder):
        for old, new in mapping.items():
            model.objects.filter(payment_method=old).update(payment_method=new)


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0019_merge_delivery_exception_and_instructions"),
        ("merchants", "0003_merchant_electronic_signature"),
    ]

    operations = [
        migrations.AlterField(
            model_name="delivery",
            name="payment_method",
            field=models.CharField(
                choices=[
                    ("card", "Debit/Credit Card"),
                    ("bankily", "Bankily"),
                    ("sedad", "Sedad"),
                    ("masravi", "Masravi"),
                ],
                default="card",
                max_length=20,
            ),
        ),
        migrations.RunPython(migrate_legacy_payment_methods, migrations.RunPython.noop),
    ]
