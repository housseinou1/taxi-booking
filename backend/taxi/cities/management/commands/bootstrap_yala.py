from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from cities.models import City, Region

from features.airports import ensure_default_airports

User = get_user_model()


def ensure_service_city():
    region, _ = Region.objects.get_or_create(
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "is_active": True,
        },
    )
    city, created = City.objects.get_or_create(
        region=region,
        name="Nouakchott",
        defaults={
            "name_fr": "Nouakchott",
            "name_ar": "نواكشوط",
            "latitude": 18.0735,
            "longitude": -15.9582,
            "is_active": True,
        },
    )
    return city, created


class Command(BaseCommand):
    help = "Seed required Yala service city data and optional local admin account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--admin-email",
            default="admin@yala.mr",
            help="Admin email to create or reset when --create-admin is used.",
        )
        parser.add_argument(
            "--admin-password",
            default="Admin12345!",
            help="Admin password to set when --create-admin is used.",
        )
        parser.add_argument(
            "--create-admin",
            action="store_true",
            help="Create or update a local admin account.",
        )

    def handle(self, *args, **options):
        city, city_created = ensure_service_city()
        self.stdout.write(
            self.style.SUCCESS(
                f"Service city ready: {city.name} ({'created' if city_created else 'exists'})"
            )
        )

        airports = ensure_default_airports()
        if airports:
            self.stdout.write(
                self.style.SUCCESS(f"Airports ready: {len(airports)} location(s) seeded")
            )
        else:
            self.stdout.write(
                self.style.WARNING("No airports seeded. Nouakchott city is required.")
            )

        if not options["create_admin"]:
            self.stdout.write("Skipped admin creation. Pass --create-admin to add one.")
            return

        email = str(options["admin_email"]).strip().lower()
        password = str(options["admin_password"])

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": "Yala",
                "last_name": "Admin",
                "user_type": "admin",
                "city": city,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        user.first_name = user.first_name or "Yala"
        user.last_name = user.last_name or "Admin"
        user.user_type = "admin"
        user.city = city
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"Admin ready: {email} ({'created' if created else 'updated'})"
            )
        )
