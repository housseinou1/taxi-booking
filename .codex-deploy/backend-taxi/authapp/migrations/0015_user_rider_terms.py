from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0014_user_legal_compliance"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="rider_terms_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="rider_terms_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="rider_terms_version",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
