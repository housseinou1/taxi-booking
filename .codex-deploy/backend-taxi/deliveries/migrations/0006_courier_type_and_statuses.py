from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0005_delivery_cities"),
    ]

    operations = [
        migrations.AddField(
            model_name="delivery",
            name="courier_type_required",
            field=models.CharField(default="motorcycle", max_length=20),
        ),
        migrations.AddField(
            model_name="delivery",
            name="courier_arriving_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="delivery",
            name="in_transit_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="delivery",
            name="status",
            field=models.CharField(
                choices=[
                    ("requested", "Requested"),
                    ("accepted", "Accepted"),
                    ("courier_arriving", "Courier Arriving"),
                    ("picked_up", "Picked Up"),
                    ("in_transit", "In Transit"),
                    ("delivering", "Delivering"),
                    ("delivered", "Delivered"),
                    ("cancelled", "Cancelled"),
                ],
                default="requested",
                max_length=20,
            ),
        ),
    ]
