"""
Squashed duplicate: all fields were already added by 0014_delivery_exception_review.
This migration is kept as a no-op so that 0019_merge_delivery_exception_and_instructions
(which depends on it) continues to resolve correctly.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("deliveries", "0014_delivery_exception_review"),
    ]

    operations = []
