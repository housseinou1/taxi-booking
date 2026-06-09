from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("rides", "0002_ride_city"),
        ("rides", "0011_add_ride_pickup_pin"),
        ("rides", "0012_add_waiting_fee"),
    ]

    operations = []
