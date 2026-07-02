from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0013_user_delivery_terms"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="delivery_terms_version",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="user",
            name="privacy_policy_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="privacy_policy_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="privacy_policy_version",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
