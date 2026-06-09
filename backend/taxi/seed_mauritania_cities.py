"""
Comprehensive Mauritania administrative divisions seed.
Based on official wilayas, moughataas (departments), and major communes.
"""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
import django
django.setup()

from cities.models import Region, City

# Official 15 Wilayas with their Moughataas and major communes/localities
MAURITANIA = {
    "Nouakchott Nord": [
        ("Dar Naim", 18.1018, -15.9307),
        ("Teyarett", 18.1242, -15.9401),
        ("Toujounine", 18.0896, -15.9754),
    ],
    "Nouakchott Ouest": [
        ("Tevragh Zeina", 18.1194, -16.0019),
        ("Ksar", 18.1002, -15.9631),
        ("Sebkha", 18.0735, -15.9582),
    ],
    "Nouakchott Sud": [
        ("Arafat", 18.0466, -15.9657),
        ("El Mina", 18.0611, -15.9826),
        ("Riyadh", 18.0259, -15.9565),
    ],
    "Dakhlet Nouadhibou": [
        ("Nouadhibou", 20.9419, -17.0384),
        ("Chami", 21.3847, -16.0136),
    ],
    "Adrar": [
        ("Atar", 20.5169, -13.0489),
        ("Chinguetti", 20.4611, -12.3508),
        ("Ouadane", 20.9308, -11.5883),
        ("Aoujeft", 19.8375, -13.4428),
    ],
    "Inchiri": [
        ("Akjoujt", 19.7464, -14.3853),
        ("Benichab", 19.0819, -15.2117),
    ],
    "Trarza": [
        ("Rosso", 16.5138, -15.8050),
        ("Boutilimit", 17.5467, -14.6944),
        ("Keur Macene", 16.5358, -16.2342),
        ("Mederdra", 16.9214, -15.6581),
        ("R'Kiz", 16.9025, -15.9589),
        ("Ouad Naga", 17.4581, -15.3336),
        ("Tiguent", 17.2358, -16.0269),
        ("Lexeiba", 16.6167, -15.3500),
        ("N'Diago", 16.2833, -16.3167),
        ("Tekane", 16.6000, -15.4667),
    ],
    "Brakna": [
        ("Aleg", 17.0528, -13.9089),
        ("Boghe", 16.5903, -14.2681),
        ("Bababe", 16.9167, -14.2667),
        ("Magta Lahjar", 17.3833, -14.7833),
        ("M'Bagne", 16.4333, -14.1167),
        ("Wad Naga", 17.4581, -15.3336),
    ],
    "Gorgol": [
        ("Kaedi", 16.1503, -13.5037),
        ("M'Bout", 16.0167, -12.5833),
        ("Maghama", 15.2167, -12.2000),
        ("Toulel", 15.22, -12.35),
        ("Monguel", 15.2333, -12.7833),
        ("Lexeiba II", 15.9500, -13.1500),
        ("Djeol", 16.3667, -13.4000),
        ("Tokomadji", 16.2000, -13.6167),
        ("N'Dioum", 16.3333, -13.2000),
    ],
    "Guidimakha": [
        ("Selibaby", 15.1585, -12.1843),
        ("Ould Yenge", 15.3000, -12.3000),
        ("Wompou", 15.0500, -12.3000),
        ("Ghabou", 14.9833, -12.2833),
        ("Hassi Chagar", 15.5333, -12.1500),
    ],
    "Assaba": [
        ("Kiffa", 16.6166, -11.4042),
        ("Guerou", 16.7333, -11.9000),
        ("Barkeol", 17.0167, -12.8167),
        ("Kankossa", 15.9333, -11.4500),
        ("Boumdeid", 17.6167, -11.6500),
        ("Bougadoum", 16.2500, -11.3000),
    ],
    "Hodh El Gharbi": [
        ("Aioun el Atrouss", 16.6614, -9.6149),
        ("Tintane", 16.3500, -10.1333),
        ("Kobeni", 15.8167, -9.4167),
        ("Tamchakett", 17.2333, -10.6667),
        ("Djiguenni", 15.3500, -7.1167),
        ("Achemim", 16.5333, -9.1500),
        ("Oualata", 17.2996, -7.0317),
    ],
    "Hodh Ech Chargui": [
        ("Nema", 16.6160, -7.2565),
        ("Bassiknou", 15.8833, -6.5833),
        ("Amourj", 16.0333, -8.5833),
        ("Timbedra", 16.2500, -8.1667),
        ("Oualata", 17.2996, -7.0317),
        ("Dhar", 16.5000, -7.5333),
        ("Adel Bagrou", 15.7333, -6.8667),
        ("Hassi Atile", 16.9000, -6.4000),
    ],
    "Tagant": [
        ("Tidjikja", 18.5564, -11.4272),
        ("Tichit", 18.4500, -9.5000),
        ("Moudjeria", 17.4500, -12.4667),
        ("N'Beika", 17.9333, -11.4333),
    ],
    "Tiris Zemmour": [
        ("Zouerate", 22.7354, -12.4783),
        ("F'Derik", 22.6700, -12.7200),
        ("Bir Moghrein", 25.2333, -11.6167),
    ],
}

print("Seeding comprehensive Mauritania administrative divisions...")
total_created = 0
total_existing = 0

for region_name, cities in MAURITANIA.items():
    region, _ = Region.objects.get_or_create(
        name=region_name,
        defaults={"name_fr": region_name, "name_ar": ""}
    )
    for city_name, lat, lng in cities:
        _, created = City.objects.get_or_create(
            region=region,
            name=city_name,
            defaults={"latitude": lat, "longitude": lng}
        )
        if created:
            total_created += 1
        else:
            total_existing += 1

print(f"\nResults:")
print(f"  New cities added: {total_created}")
print(f"  Already existed: {total_existing}")
print(f"  Total in DB: {City.objects.count()}")
print(f"\nRegion breakdown:")
for r in Region.objects.all().order_by("name"):
    print(f"  {r.name}: {r.cities.count()}")
