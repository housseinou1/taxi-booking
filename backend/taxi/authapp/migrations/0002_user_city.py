from django.db import migrations, models
import django.db.models.deletion


def assign_default_city(apps, schema_editor):
    User = apps.get_model("authapp", "User")
    City = apps.get_model("locations", "City")
    nouakchott = City.objects.filter(name__iexact="Nouakchott").first()
    if nouakchott:
        User.objects.filter(city__isnull=True).update(city=nouakchott)


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0001_initial"),
        ("authapp", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="city",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="users",
                to="locations.city",
            ),
        ),
        migrations.RunPython(assign_default_city, migrations.RunPython.noop),
    ]
