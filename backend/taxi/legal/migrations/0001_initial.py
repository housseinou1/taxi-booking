from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LegalComplianceLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "agreement_type",
                    models.CharField(
                        choices=[
                            ("courier", "Yala Delivery Courier"),
                            ("merchant", "Yala Merchant"),
                            ("customer_delivery", "Yala Delivery Customer"),
                            ("rider", "Yala Rider"),
                            ("driver", "Yala Driver"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("e_sign", "Electronic Signature"),
                            ("checkbox_accept", "Checkbox Acceptance"),
                            ("resign", "Re-signed"),
                        ],
                        default="e_sign",
                        max_length=20,
                    ),
                ),
                ("terms_version", models.CharField(blank=True, default="", max_length=30)),
                ("signed_full_name", models.CharField(blank=True, default="", max_length=200)),
                ("signature_image", models.ImageField(blank=True, null=True, upload_to="legal/signatures/")),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("device_info", models.TextField(blank=True, default="")),
                ("app_version", models.CharField(blank=True, default="", max_length=40)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="legal_compliance_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="legalcompliancelog",
            index=models.Index(fields=["agreement_type", "-created_at"], name="legal_log_type_idx"),
        ),
        migrations.AddIndex(
            model_name="legalcompliancelog",
            index=models.Index(fields=["user", "-created_at"], name="legal_log_user_idx"),
        ),
    ]
