from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from cities.models import City, Region

from features.airports import ensure_default_airports

User = get_user_model()

WILAYA_SERVICE_CITIES = [
    ("Nouakchott", "Nouakchott", "نواكشوط", 18.0735, -15.9582),
    ("Dakhlet Nouadhibou", "Nouadhibou", "نواذيبو", 20.94188, -17.03842),
    ("Dakhlet Nouadhibou", "Chami", "شامي", 21.2833, -16.9667),
    ("Adrar", "Atar", "أطار", 20.5169, -13.0489),
    ("Adrar", "Chinguetti", "شنقيط", 20.4647, -12.3617),
    ("Adrar", "Ouadane", "وادان", 20.9289, -11.6233),
    ("Adrar", "Aoujeft", "أوجفت", 19.9683, -13.0433),
    ("Inchiri", "Akjoujt", "أكجوجت", 19.7464, -14.3853),
    ("Inchiri", "Benichab", "بني شب", 19.0819, -15.2117),
    ("Inchiri", "Mhaijratt", "محيرات", 18.7206, -16.0578),
    ("Trarza", "Rosso", "روصو", 16.51378, -15.80503),
    ("Trarza", "Boutilimit", "بوتيليميت", 17.5467, -14.6944),
    ("Trarza", "Keur Macene", "كور ماسين", 16.5358, -16.2342),
    ("Trarza", "Mederdra", "مدرارة", 16.9214, -15.6581),
    ("Trarza", "R'Kiz", "اركيز", 16.9025, -15.9589),
    ("Trarza", "Wad Naga", "واد نaga", 17.4581, -15.3336),
    ("Trarza", "Tiguent", "تيقنت", 17.2358, -16.0269),
    ("Trarza", "Tekane", "تكنة", 16.5833, -16.2167),
    ("Brakna", "Aleg", "الاك", 17.0528, -13.9089),
    ("Brakna", "Boghe", "بوغي", 16.7, -14.2667),
    ("Brakna", "Bababe", "بابابي", 16.5833, -14.85),
    ("Brakna", "Magta Lahjar", "مقطع لحجار", 17.9667, -13.9167),
    ("Brakna", "Male", "مالي", 15.2333, -14.2833),
    ("Brakna", "M'Bagne", "امباغن", 16.0167, -13.9667),
    ("Gorgol", "Kaedi", "كيهيدي", 16.1503, -13.5037),
    ("Gorgol", "Maghama", "مغامة", 15.5101, -12.851),
    ("Gorgol", "Toulel", "تولل", 15.485, -12.82),
    ("Gorgol", "M'Bout", "امبوت", 16.0167, -12.5833),
    ("Gorgol", "Monguel", "مونكل", 15.9167, -12.7833),
    ("Guidimakha", "Selibaby", "سيلبابي", 15.15846, -12.1843),
    ("Guidimakha", "Ould Yenge", "ولد ينجي", 15.4167, -12.3833),
    ("Guidimakha", "Wompou", "ومبو", 15.1167, -11.8167),
    ("Guidimakha", "Ghabou", "غابو", 15.6167, -12.35),
    ("Assaba", "Kiffa", "كيفة", 16.6166, -11.4042),
    ("Assaba", "Guerou", "كرو", 16.8131, -12.8022),
    ("Assaba", "Barkeol", "باركول", 16.92, -12.55),
    ("Assaba", "Kankossa", "كانكوسة", 15.8833, -11.85),
    ("Assaba", "Boumdeid", "بومديد", 17.0833, -12.4167),
    ("Hodh El Gharbi", "Aioun el Atrouss", "عيون العتروس", 16.6614, -9.6149),
    ("Hodh El Gharbi", "Tintane", "تينتان", 16.1167, -10.5833),
    ("Hodh El Gharbi", "Kobeni", "كوبني", 15.8167, -9.4167),
    ("Hodh El Gharbi", "Tamchekett", "تامشكط", 17.2167, -10.7333),
    ("Hodh El Gharbi", "Touil", "تويل", 16.8833, -10.2667),
    ("Hodh Ech Chargui", "Nema", "النعمة", 16.616, -7.2565),
    ("Hodh Ech Chargui", "Bassiknou", "باسكنو", 15.8667, -5.95),
    ("Hodh Ech Chargui", "Djiguenni", "جيكني", 16.3167, -6.2333),
    ("Hodh Ech Chargui", "Amourj", "أمورج", 18.0833, -5.7167),
    ("Hodh Ech Chargui", "Adel Bagrou", "عدل بكرو", 15.5667, -7.3833),
    ("Hodh Ech Chargui", "Timbedra", "تمبدغة", 15.6667, -8.0),
    ("Hodh Ech Chargui", "Oualata", "ولاتة", 17.3, -7.0167),
    ("Tagant", "Tidjikja", "تجكجة", 18.5564, -11.4272),
    ("Tagant", "Tichit", "تشيت", 18.45, -9.5167),
    ("Tagant", "Moudjeria", "مجيرية", 17.4833, -12.3333),
    ("Tiris Zemmour", "Zouerate", "ازويرات", 22.7354, -12.4783),
    ("Tiris Zemmour", "F'Derik", "افديرك", 22.6833, -12.7167),
    ("Tiris Zemmour", "Bir Moghrein", "بير امغريين", 25.2333, -11.5833),
]


def ensure_service_cities():
    created_names = []
    existing_names = []
    primary_city = None

    for wilaya, name, name_ar, lat, lng in WILAYA_SERVICE_CITIES:
        region, _ = Region.objects.get_or_create(
            name=wilaya,
            defaults={
                "name_fr": wilaya,
                "name_ar": wilaya,
                "is_active": True,
            },
        )
        city, created = City.objects.get_or_create(
            region=region,
            name=name,
            defaults={
                "name_fr": name,
                "name_ar": name_ar,
                "latitude": lat,
                "longitude": lng,
                "is_active": True,
            },
        )
        if name == "Nouakchott":
            primary_city = city
        if created:
            created_names.append(city.name)
        else:
            existing_names.append(city.name)

    return primary_city, created_names, existing_names


def ensure_service_city():
    city, _, _ = ensure_service_cities()
    return city, city is not None


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
        city, created_names, existing_names = ensure_service_cities()
        if created_names:
            self.stdout.write(self.style.SUCCESS(f"Created cities: {', '.join(created_names)}"))
        if existing_names:
            self.stdout.write(self.style.SUCCESS(f"Existing cities: {', '.join(existing_names)}"))
        self.stdout.write(self.style.SUCCESS(f"Primary service city: {city.name}"))

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
