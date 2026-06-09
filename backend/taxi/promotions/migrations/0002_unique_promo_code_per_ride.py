from django.db import migrations, models


def remove_duplicate_ride_promos(apps, schema_editor):
    PromoCodeUsage = apps.get_model("promotions", "PromoCodeUsage")
    seen = set()
    for usage in PromoCodeUsage.objects.order_by("created_at", "id").iterator():
        key = (usage.promo_code_id, usage.ride_id)
        if key in seen:
            usage.delete()
        else:
            seen.add(key)


class Migration(migrations.Migration):
    dependencies = [
        ("promotions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(remove_duplicate_ride_promos, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="promocodeusage",
            constraint=models.UniqueConstraint(
                fields=("promo_code", "ride"),
                name="unique_promo_code_per_ride",
            ),
        ),
    ]
