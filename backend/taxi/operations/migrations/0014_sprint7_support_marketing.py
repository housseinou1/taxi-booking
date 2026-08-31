# Sprint 7 — Support ticket workspace + Marketing campaign pause

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("operations", "0013_sprint6_finance_driver_ops"),
    ]

    operations = [
        migrations.AddField(
            model_name="betafeedback",
            name="conversation",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="internal_notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="resolution_code",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="escalated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="escalated_to",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="sla_first_response_due",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="sla_resolution_due",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="lost_property_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "N/A"),
                    ("reported", "Reported"),
                    ("driver_contacted", "Driver Contacted"),
                    ("item_found", "Item Found"),
                    ("return_arranged", "Return Arranged"),
                    ("returned", "Returned"),
                    ("not_found", "Not Found"),
                    ("closed", "Closed"),
                ],
                default="",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="betafeedback",
            name="reopen_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="betafeedback",
            name="category",
            field=models.CharField(
                choices=[
                    ("emergency", "Emergency"),
                    ("ride", "Ride Issue"),
                    ("payment", "Payment Issue"),
                    ("refund", "Refund"),
                    ("driver", "Driver Issue"),
                    ("rider", "Rider Issue"),
                    ("safety", "Safety"),
                    ("lost_property", "Lost Property"),
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
                    ("account", "Account Access"),
                    ("promotion", "Promotion"),
                    ("technical", "Technical Problem"),
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
                    ("open", "Open / New"),
                    ("assigned", "Open"),
                    ("waiting", "Waiting for Customer"),
                    ("waiting_internal", "Waiting for Internal Team"),
                    ("escalated", "Escalated"),
                    ("resolved", "Resolved"),
                    ("closed", "Closed"),
                    ("reopened", "Reopened"),
                ],
                db_index=True,
                default="open",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="marketingcampaign",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("scheduled", "Scheduled"),
                    ("active", "Active"),
                    ("paused", "Paused"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
            ),
        ),
    ]
