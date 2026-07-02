from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0017_courier_electronic_signature"),
    ]

    operations = [
        migrations.AddField(
            model_name="driverprofile",
            name="driver_terms_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_terms_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_terms_version",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_signature_image",
            field=models.ImageField(blank=True, null=True, upload_to="legal/driver_signatures/"),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_signed_full_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_signed_ip_address",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_signed_device_info",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_signed_app_version",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_legal_declaration_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="driverprofile",
            name="driver_terms_scrolled_to_bottom",
            field=models.BooleanField(default=False),
        ),
    ]
