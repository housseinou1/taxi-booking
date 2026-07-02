import importlib
from decimal import Decimal

from django.db import migrations


LOCATION_MODELS = (
    "Region",
    "Department",
    "Commune",
    "Locality",
    "City",
    "CityPricing",
)


def repair_missing_location_tables(apps, schema_editor):
    """Repair databases where location migrations were recorded but tables were not created."""
    existing_tables = set(schema_editor.connection.introspection.table_names())
    repaired_missing_tables = False

    for model_name in LOCATION_MODELS:
        model = apps.get_model("locations", model_name)
        if model._meta.db_table not in existing_tables:
            # An interrupted PostgreSQL migration can leave the composite table
            # type behind even though the table itself was rolled back.
            if schema_editor.connection.vendor == "postgresql":
                table_name = schema_editor.quote_name(model._meta.db_table)
                schema_editor.execute(f"DROP TYPE IF EXISTS {table_name} CASCADE")
            schema_editor.create_model(model)
            existing_tables.add(model._meta.db_table)
            repaired_missing_tables = True

    if repaired_missing_tables:
        initial = importlib.import_module("locations.migrations.0001_initial")
        hierarchy = importlib.import_module(
            "locations.migrations.0003_administrative_hierarchy"
        )
        initial.seed_locations(apps, schema_editor)
        hierarchy.seed_administrative_hierarchy(apps, schema_editor)

    Region = apps.get_model("locations", "Region")
    Commune = apps.get_model("locations", "Commune")
    City = apps.get_model("locations", "City")
    CityPricing = apps.get_model("locations", "CityPricing")

    region = Region.objects.get(name="Nouakchott Ouest")
    commune = Commune.objects.filter(
        department__region=region,
        name="Tevragh Zeina",
    ).first()
    nouakchott, _ = City.objects.get_or_create(
        name="Nouakchott",
        defaults={
            "region": region,
            "commune": commune,
            "slug": "nouakchott-ouest-nouakchott",
            "is_active": True,
            "is_default": True,
        },
    )
    if not nouakchott.is_default or not nouakchott.is_active:
        nouakchott.is_default = True
        nouakchott.is_active = True
        nouakchott.save(update_fields=["is_default", "is_active"])

    for ride_type, base_fare, per_km in (
        ("regular", Decimal("200.00"), Decimal("20.00")),
        ("xl", Decimal("300.00"), Decimal("30.00")),
        ("comfort", Decimal("350.00"), Decimal("35.00")),
        ("share", Decimal("150.00"), Decimal("15.00")),
    ):
        CityPricing.objects.get_or_create(
            city=nouakchott,
            ride_type=ride_type,
            defaults={
                "base_fare": base_fare,
                "per_km": per_km,
                "minimum_fare": Decimal("0.00"),
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0003_administrative_hierarchy"),
    ]

    operations = [
        migrations.RunPython(
            repair_missing_location_tables,
            migrations.RunPython.noop,
        ),
    ]
