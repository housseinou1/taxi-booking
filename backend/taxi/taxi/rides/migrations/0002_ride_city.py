from django.db import migrations, models
import django.db.models.deletion


def assign_default_city(apps, schema_editor):
    Ride = apps.get_model("rides", "Ride")
    City = apps.get_model("locations", "City")
    nouakchott = City.objects.filter(name__iexact="Nouakchott").first()
    if nouakchott:
        Ride.objects.filter(city__isnull=True).update(city=nouakchott)


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0001_initial"),
        ("rides", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="ride",
            name="city",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="rides",
                to="locations.city",
            ),
        ),
        migrations.AddIndex(
            model_name="ride",
            index=models.Index(fields=["city", "status"], name="ride_city_status_idx"),
        ),
        migrations.RunPython(assign_default_city, migrations.RunPython.noop),
    ]
