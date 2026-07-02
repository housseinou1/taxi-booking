from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0015_user_rider_terms"),
    ]

    operations = [
        migrations.RenameField(
            model_name="user",
            old_name="rider_terms_accepted",
            new_name="ride_terms_accepted",
        ),
        migrations.RenameField(
            model_name="user",
            old_name="rider_terms_accepted_at",
            new_name="ride_terms_accepted_at",
        ),
        migrations.RenameField(
            model_name="user",
            old_name="rider_terms_version",
            new_name="ride_terms_version",
        ),
    ]
