from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("authapp", "0012_add_merchant_user_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="delivery_terms_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="delivery_terms_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
