# Support system extensions for BetaFeedback

from django.db import migrations, models


def migrate_legacy_statuses(apps, schema_editor):
    BetaFeedback = apps.get_model("operations", "BetaFeedback")
    BetaFeedback.objects.filter(status="new").update(status="open")
    BetaFeedback.objects.filter(status="investigating").update(status="assigned")
    BetaFeedback.objects.filter(status="fixed").update(status="resolved")


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0006_betafeedback"),
    ]

    operations = [
        migrations.AddField(
            model_name="betafeedback",
            name="subject",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="is_emergency",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="first_response_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="betafeedback",
            name="category",
            field=models.CharField(
                choices=[
                    ("emergency", "Emergency"),
                    ("ride", "Ride Issue"),
                    ("payment", "Payment Issue"),
                    ("driver", "Driver Issue"),
                    ("rider", "Rider Issue"),
                    ("gps", "GPS Issue"),
                    ("bug", "App Bug"),
                    ("suggestion", "Suggestion"),
                    ("contact", "Contact Support"),
                    ("vehicle", "Vehicle Issue"),
                    ("withdrawal", "Withdrawal Issue"),
                    ("customer", "Customer Issue"),
                    ("store", "Store Issue"),
                    ("delivery", "Delivery Issue"),
                    ("crash", "Crash"),
                    ("account", "Account"),
                    ("ui", "UI/UX"),
                    ("performance", "Performance"),
                    ("other", "Other"),
                ],
                db_index=True,
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="betafeedback",
            name="status",
            field=models.CharField(
                choices=[
                    ("open", "Open"),
                    ("assigned", "Assigned"),
                    ("waiting", "Waiting"),
                    ("resolved", "Resolved"),
                    ("closed", "Closed"),
                ],
                db_index=True,
                default="open",
                max_length=20,
            ),
        ),
        migrations.RunPython(migrate_legacy_statuses, migrations.RunPython.noop),
    ]
