"""Idempotently register service cities from the command line.

Runs correctly whether or not ``cities.0005_city_management`` has been applied:
the registry, region and audit writes work today, and the extra metadata
(country, ISO code, time zone, short code, live gate) is added automatically
once the migration is in place.

Examples::

    python manage.py ensure_city                       # the 4 expansion cities
    python manage.py ensure_city --list                # show the registry
    python manage.py ensure_city --name Atar --region Adrar
    python manage.py ensure_city --dry-run             # preview, change nothing
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from cities.models import City
from cities.services import city_management_ready, ensure_city, ensure_service_catalog

#: Founder/CEO expansion directive — validated coordinates, never invented.
EXPANSION_CITIES = [
    ("Atar", "Adrar", "Atar", "أطار", 20.5169, -13.0489, "ATR"),
    ("Kaedi", "Gorgol", "Kaédi", "كيهيدي", 16.1503, -13.5037, "KAE"),
    ("Selibaby", "Guidimakha", "Sélibaby", "سيلبابي", 15.15846, -12.1843, "SEL"),
    ("Zouerate", "Tiris Zemmour", "Zouérat", "ازويرات", 22.7354, -12.4783, "ZOU"),
]


class Command(BaseCommand):
    help = "Register service cities idempotently (no duplicates, nothing deleted)."

    def add_arguments(self, parser):
        parser.add_argument("--name", help="City name to register.")
        parser.add_argument("--region", help="Region/wilaya for --name.")
        parser.add_argument("--name-fr", default="", help="Official French spelling.")
        parser.add_argument("--name-ar", default="", help="Official Arabic spelling.")
        parser.add_argument("--latitude", type=float, default=None)
        parser.add_argument("--longitude", type=float, default=None)
        parser.add_argument("--code", default="", help="Short operations code, e.g. ATR.")
        parser.add_argument(
            "--refresh-names",
            action="store_true",
            help="Overwrite existing French/Arabic spellings (default: fill blanks only).",
        )
        parser.add_argument("--dry-run", action="store_true", help="Preview only.")
        parser.add_argument("--list", action="store_true", help="List the registry.")

    def handle(self, *args, **options):
        if options["list"]:
            self.stdout.write(
                f"Registry: {City.objects.count()} cities across "
                f"{City.objects.values('region').distinct().count()} regions."
            )
            for city in City.objects.select_related("region").order_by("region__name", "name"):
                self.stdout.write(
                    f"  #{city.pk:<4} {city.name:<18} {city.region.name:<22} "
                    f"fr={city.name_fr or '-':<18} active={city.is_active}"
                )
            return

        if options["name"]:
            if not options["region"]:
                raise CommandError("--region is required with --name.")
            entries = [
                (
                    options["name"],
                    options["region"],
                    options["name_fr"] or options["name"],
                    options["name_ar"],
                    options["latitude"],
                    options["longitude"],
                    options["code"],
                )
            ]
        else:
            entries = EXPANSION_CITIES

        ready = city_management_ready()
        self.stdout.write(
            f"City Management tables: {'available' if ready else 'NOT applied yet'}"
            + (
                ""
                if ready
                else " (registry registration still works; service activation "
                "requires cities.0005_city_management)"
            )
        )

        created_count = 0
        for name, region_name, name_fr, name_ar, latitude, longitude, code in entries:
            if options["dry_run"]:
                existing = City.objects.filter(
                    region__name__iexact=region_name, name__iexact=name
                ).first()
                self.stdout.write(
                    f"  [dry-run] {name} ({region_name}): "
                    f"{'already registered as #%s' % existing.pk if existing else 'would be created'}"
                )
                continue
            with transaction.atomic():
                city, created = ensure_city(
                    name=name,
                    region_name=region_name,
                    name_fr=name_fr,
                    name_ar=name_ar,
                    latitude=latitude,
                    longitude=longitude,
                    code=code,
                    refresh_names=options["refresh_names"],
                    reason="Registered by ensure_city management command",
                )
                services_created = ensure_service_catalog(city)
            created_count += 1 if created else 0
            self.stdout.write(
                f"  {'CREATED' if created else 'EXISTING'} #{city.pk} {city.name} "
                f"({city.region.name})"
                + (
                    f" — {services_created} service rows added (all inactive)"
                    if services_created
                    else ""
                )
            )

        if not options["dry_run"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Done. {created_count} city(ies) created, "
                    f"{len(entries) - created_count} already registered. "
                    "No city or service is live."
                )
            )
