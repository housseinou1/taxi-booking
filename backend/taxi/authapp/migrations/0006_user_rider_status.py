from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0005_user_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="rider_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="approved",
                max_length=20,
            ),
        ),
    ]
