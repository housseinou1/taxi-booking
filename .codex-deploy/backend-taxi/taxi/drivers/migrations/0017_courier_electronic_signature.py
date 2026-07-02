from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0016_driverprofile_pending_review_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="legal_declaration_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="signature_image",
            field=models.ImageField(blank=True, null=True, upload_to="legal/courier_signatures/"),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="signed_app_version",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="signed_device_info",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="signed_full_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="signed_ip_address",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="terms_scrolled_to_bottom",
            field=models.BooleanField(default=False),
        ),
    ]
