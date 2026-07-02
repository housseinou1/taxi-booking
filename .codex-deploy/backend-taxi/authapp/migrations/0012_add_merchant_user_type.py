from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("authapp", "0011_add_city_fk"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="user_type",
            field=models.CharField(
                choices=[
                    ("rider", "Rider"),
                    ("driver", "Driver"),
                    ("merchant", "Merchant"),
                ],
                default="rider",
                max_length=20,
            ),
        ),
    ]
