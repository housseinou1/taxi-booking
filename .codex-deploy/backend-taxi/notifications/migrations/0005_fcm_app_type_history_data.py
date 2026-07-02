from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0004_notificationhistory"),
    ]

    operations = [
        migrations.AddField(
            model_name="fcmtoken",
            name="app_type",
            field=models.CharField(
                choices=[("rider", "Rider"), ("driver", "Driver"), ("web", "Web")],
                default="web",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="notificationhistory",
            name="data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="notificationhistory",
            name="deep_link",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
