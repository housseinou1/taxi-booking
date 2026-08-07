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
            name="ApprovalAction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("admin_name", models.CharField(blank=True, default="", max_length=200)),
                ("target_type", models.CharField(choices=[("rider", "Rider"), ("driver", "Driver"), ("courier", "Delivery Courier")], max_length=20)),
                ("action", models.CharField(choices=[("approve", "Approved"), ("reject", "Rejected"), ("suspend", "Suspended"), ("reactivate", "Reactivated"), ("request_info", "Requested More Information")], max_length=20)),
                ("reason", models.TextField(blank=True, default="")),
                ("notes", models.TextField(blank=True, default="")),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("is_ceo_override", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("admin", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approval_actions", to=settings.AUTH_USER_MODEL)),
                ("target_user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_history", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="approvalaction",
            index=models.Index(fields=["target_user", "-created_at"], name="approval_target_idx"),
        ),
        migrations.AddIndex(
            model_name="approvalaction",
            index=models.Index(fields=["target_type", "action", "-created_at"], name="approval_type_action_idx"),
        ),
        migrations.AddIndex(
            model_name="approvalaction",
            index=models.Index(fields=["admin", "-created_at"], name="approval_admin_idx"),
        ),
    ]
