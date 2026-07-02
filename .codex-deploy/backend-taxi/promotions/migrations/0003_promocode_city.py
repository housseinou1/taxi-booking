from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0001_initial"),
        ("promotions", "0002_unique_promo_code_per_ride"),
    ]

    operations = [
        migrations.AddField(
            model_name="promocode",
            name="city",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional city restriction. Blank means available in every city.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="promo_codes",
                to="locations.city",
            ),
        ),
    ]
