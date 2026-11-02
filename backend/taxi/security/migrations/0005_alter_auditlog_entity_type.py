from django.db import migrations, models


class Migration(migrations.Migration):
    """Driver audit trail support for AuditLog.

    - Adds the "driver" entity type so driver lifecycle actions can be filtered
      in the admin audit trail (they previously had no dedicated entity type).
    - Adds driver lifecycle action codes: approve, reject, suspend, reactivate,
      reintegrate and approval_blocked.
    """

    dependencies = [
        ("security", "0004_alter_auditlog_entity_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="auditlog",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("delivery", "Delivery"),
                    ("merchant", "Merchant"),
                    ("courier", "Courier"),
                    ("customer", "Customer"),
                    ("payment", "Payment"),
                    ("refund", "Refund"),
                    ("document", "Document"),
                    ("system", "System"),
                    ("employee", "Employee"),
                    ("id_card", "Employee ID Card"),
                    ("driver", "Driver"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="auditlog",
            name="action",
            field=models.CharField(
                choices=[
                    ("status_change", "Status Change"),
                    ("payment_change", "Payment Change"),
                    ("refund", "Refund"),
                    ("admin_action", "Admin Action"),
                    ("document_approval", "Document Approval"),
                    ("verification_event", "Verification Event"),
                    ("fraud_flag", "Fraud Flag"),
                    ("approve", "Approved"),
                    ("reject", "Rejected"),
                    ("suspend", "Suspended"),
                    ("reactivate", "Reactivated"),
                    ("reintegrate", "Reintegrated"),
                    ("approval_blocked", "Approval Blocked"),
                ],
                max_length=30,
            ),
        ),
    ]
