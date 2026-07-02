from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("merchants", "0002_merchant_order_dropoff_instructions"),
    ]

    operations = [
        migrations.AddField(
            model_name="merchant",
            name="legal_declaration_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="merchant",
            name="signature_image",
            field=models.ImageField(blank=True, null=True, upload_to="legal/merchant_signatures/"),
        ),
        migrations.AddField(
            model_name="merchant",
            name="signed_app_version",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="merchant",
            name="signed_device_info",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="merchant",
            name="signed_full_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="merchant",
            name="signed_ip_address",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="merchant",
            name="terms_accepted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="merchant",
            name="terms_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="merchant",
            name="terms_scrolled_to_bottom",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="merchant",
            name="terms_version",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]
