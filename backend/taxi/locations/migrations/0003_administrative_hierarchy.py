from django.db import migrations, models
from django.utils.text import slugify
import django.db.models.deletion


# Wilaya -> Moughataa -> communes. Names follow the current national
# administrative hierarchy used by Mauritania's 2025 digital-addressing work.
ADMIN_DIVISIONS = {
    "Adrar": {
        "Aoujeft": ["Aoujeft", "El Medah", "Maaden", "N'Teirguent"],
        "Atar": ["Atar", "Aïn Ehel Taya", "Choum", "Tawaz"],
        "Chinguetti": ["Chinguetti", "Aïn Savra"],
        "Ouadane": ["Ouadane"],
    },
    "Assaba": {
        "Aftout": ["Barkéol", "Boulahrath", "Daghveg", "El Ghabra", "Gueller", "Laweissi", "Lebhir", "R'Dheidhi"],
        "Boumdeid": ["Boumdeid", "Laftah", "Hsey Tine"],
        "Guerou": ["Guerou", "El Ghayra", "Kamour", "Oudey Jrid"],
        "Kankossa": ["Kankossa", "Blajmil", "Hamed", "Sani", "Tenaha"],
        "Kiffa": ["Kiffa", "Aghoratt", "El Melgua", "Kouroudel", "Legrane", "Nouamleine"],
    },
    "Brakna": {
        "Aleg": ["Aleg", "Aghchorguitt", "Bouhdida", "Cheggar"],
        "Bababé": ["Bababé", "Aéré M'Bar", "El Verea"],
        "Boghé": ["Boghé", "Dar El Aviya", "Dar El Barka", "Ould Birem"],
        "Magta Lahjar": ["Magta Lahjar", "Djonaba", "Ouad Amour", "Sangrave"],
        "Male": ["Male", "Bourat", "Dielwar", "Elbatha", "Lem Oudou"],
        "M'Bagne": ["M'Bagne", "Bagodine", "Edbaye El Hejaj", "Niabina"],
    },
    "Dakhlet Nouadhibou": {
        "Chami": ["Chami", "Nouamghar", "Tmeimichatt"],
        "Nouadhibou": ["Nouadhibou", "Boulenouar", "Inal"],
    },
    "Gorgol": {
        "Kaédi": ["Kaédi", "Djewol", "Néré Walo", "Toufoundé Civé", "Tokomadji"],
        "Lexeiba 1": ["Lexeiba 1", "Betengal", "Ganki", "Talhaya"],
        "Maghama": ["Maghama", "Beileguet Litama", "Daw", "Dodol Cover", "Sagné", "Toulel", "Vréa Litama", "Waly Diantang"],
        "M'Bout": ["M'Bout", "Chelkhet Tiyad", "Diadjibine Gandega", "Edebaye Ehl Guelay", "Foum Gleita", "Lahrach", "Souve", "Tarenguet Ehel Moul", "Tikobra"],
        "Monguel": ["Monguel", "Azgueilem Tiyab", "Bokkol", "Bathet Moit", "Melzem Teichett"],
    },
    "Guidimakha": {
        "Ghabou": ["Ghabou", "Baidiyam", "Chleikha", "Diogountourou", "Gouraye", "Soufa"],
        "Sélibaby": ["Sélibaby", "Hassi Cheggar", "Ould M'Bouni", "Tachott"],
        "Ould Yengé": ["Ould Yengé", "Bouanze", "Boully", "Dafort", "Lahraj", "Leweynatt", "Tektaka"],
        "Wompou": ["Wompou", "Agouanitt", "Ajar", "Arr", "Sangué Diéri"],
    },
    "Hodh Ech Chargui": {
        "Adel Bagrou": ["Adel Bagrou", "El Masgoul Lebyadh", "Sivane"],
        "Amourj": ["Amourj", "Bougadoum", "Dieigui", "Legdour", "Oum Eacheiche"],
        "Bassiknou": ["Bassiknou", "Dhar", "El Megve", "Fassala"],
        "Djiguenni": ["Djiguenni", "Aoueinat Zbel", "Benamane", "Mabrouk", "Feireni", "Ghlig Ehel Boye", "Ksar El Barka"],
        "Néma": ["Néma", "Achemine", "Agoueinit", "Bangou", "Beribavatt", "Mabrouk", "Hassi Attilla", "Jreif", "Noual", "Oum Avnadech"],
        "N'Beiket Lehwach": ["N'Beiket Lehwach", "Nouawdar"],
        "Oualata": ["Oualata"],
        "Timbedra": ["Timbedra", "Bousteille", "Hassi M'Hadi", "Koumbi Saleh", "Touil"],
    },
    "Hodh El Gharbi": {
        "Aïoun": ["Aïoun", "Beneamane", "Doueirara", "Egjert", "N'Savenni", "Oum Lahyad", "Ten Hamadi"],
        "Kobeni": ["Kobeni", "Gogui", "Hassi Ehel Ahmed Bechna", "Leghligue", "Modibougou", "Timzine", "Voulaniya"],
        "Tamchekett": ["Tamchekett", "Guateidoume", "Mabrouk", "Radhi", "Sava"],
        "Tintane": ["Tintane", "Aïn Varba", "Aweintat", "Devaa", "Agharghar", "Hassi Abdallah"],
        "Touil": ["Touil", "Baghdad", "Lehreijat", "Sett"],
    },
    "Inchiri": {
        "Akjoujt": ["Akjoujt"],
        "Benichab": ["Benichab", "Mhaijratt"],
    },
    "Nouakchott Nord": {
        "Dar Naïm": ["Dar Naïm"],
        "Teyarett": ["Teyarett"],
        "Toujounine": ["Toujounine"],
    },
    "Nouakchott Ouest": {
        "Ksar": ["Ksar"],
        "Sebkha": ["Sebkha"],
        "Tevragh Zeina": ["Tevragh Zeina"],
    },
    "Nouakchott Sud": {
        "Arafat": ["Arafat"],
        "El Mina": ["El Mina"],
        "Riyad": ["Riyad"],
    },
    "Tagant": {
        "Moudjeria": ["Moudjeria", "Nbeika", "Soudoud"],
        "Tichit": ["Tichit", "Lekhcheb"],
        "Tidjikja": ["Tidjikja", "Boubacar Ben Amer", "Lehsira", "Tensigh", "El Wahatt"],
    },
    "Tiris Zemmour": {
        "Bir Moghrein": ["Bir Moghrein"],
        "F'Dérik": ["F'Dérik"],
        "Zouérat": ["Zouérat"],
    },
    "Trarza": {
        "Boutilimit": ["Boutilimit", "Ajoueir", "Elb Adress", "El Mouyessar", "Nebaghia", "N'Teichitt", "Tinghadej"],
        "Keur Macène": ["Keur Macène", "M'Balel", "Ndiago"],
        "Mederdra": ["Mederdra", "Boeir Tores", "El Khatt", "Taguilalett", "Tiguent"],
        "Ouad Naga": ["Ouad Naga", "Aouleiguatt", "El Aria"],
        "R'Kiz": ["R'Kiz", "Bareina", "Boutalhaya"],
        "Rosso": ["Rosso", "Jidr El Mouhguen"],
        "Tékane": ["Tékane", "Chemame", "Lexeiba", "Teichetayatt"],
    },
}


CITY_ALIASES = {
    "Aioun": "Aïoun",
    "Aoujeft": "Aoujeft",
    "Barkéol": "Barkéol",
    "Bassiknou": "Bassiknou",
    "Boghé": "Boghé",
    "Chinguetti": "Chinguetti",
    "F'Dérik": "F'Dérik",
    "Guerou": "Guerou",
    "Keur Macène": "Keur Macène",
    "Kiffa": "Kiffa",
    "Kobeni": "Kobeni",
    "Magta Lahjar": "Magta Lahjar",
    "Monguel": "Monguel",
    "Moudjéria": "Moudjeria",
    "Ould Yengé": "Ould Yengé",
    "Sélibaby": "Sélibaby",
    "Tamchekett": "Tamchekett",
    "Tichit": "Tichit",
    "Toulel": "Toulel",
}


def seed_administrative_hierarchy(apps, schema_editor):
    Region = apps.get_model("locations", "Region")
    Department = apps.get_model("locations", "Department")
    Commune = apps.get_model("locations", "Commune")
    Locality = apps.get_model("locations", "Locality")
    City = apps.get_model("locations", "City")

    for region_name, departments in ADMIN_DIVISIONS.items():
        region, _ = Region.objects.get_or_create(
            name=region_name,
            defaults={"slug": slugify(region_name), "is_active": True},
        )
        for department_name, communes in departments.items():
            department, _ = Department.objects.get_or_create(
                region=region,
                name=department_name,
                defaults={
                    "slug": slugify(f"{region_name}-{department_name}"),
                    "is_active": True,
                },
            )
            for commune_name in communes:
                Commune.objects.get_or_create(
                    department=department,
                    name=commune_name,
                    defaults={
                        "slug": slugify(
                            f"{region_name}-{department_name}-{commune_name}"
                        ),
                        "is_active": True,
                    },
                )

    # Preserve legacy foreign keys while removing the duplicate spelling from
    # active choices. Existing records can be reassigned safely by admins.
    legacy_guidimaka = Region.objects.filter(name="Guidimaka").first()
    if legacy_guidimaka:
        legacy_guidimaka.name = "Guidimaka (legacy)"
        legacy_guidimaka.slug = "guidimaka-legacy"
        legacy_guidimaka.is_active = False
        legacy_guidimaka.save(update_fields=["name", "slug", "is_active"])

    # Keep existing operational cities, but attach each to the official commune
    # and create an initial service locality for future finer-grained coverage.
    for city in City.objects.select_related("region").all():
        target_name = CITY_ALIASES.get(city.name, city.name)
        candidates = Commune.objects.filter(name=target_name)
        commune = candidates.filter(department__region=city.region).first()
        if not commune and city.name == "Nouakchott":
            commune = Commune.objects.filter(
                department__region__name="Nouakchott Ouest",
                name="Tevragh Zeina",
            ).first()
            if commune:
                city.region = commune.department.region
        if not commune:
            commune = candidates.first()
        if commune:
            city.commune = commune
            city.save(update_fields=["region", "commune"])
            commune.service_enabled = city.is_active
            commune.save(update_fields=["service_enabled"])
            commune.department.service_enabled = True
            commune.department.save(update_fields=["service_enabled"])
            Locality.objects.get_or_create(
                commune=commune,
                name=city.name,
                defaults={
                    "slug": slugify(
                        f"{commune.department.region.name}-"
                        f"{commune.department.name}-{commune.name}-{city.name}"
                    ),
                    "is_active": city.is_active,
                    "service_enabled": city.is_active,
                    "latitude": city.latitude,
                    "longitude": city.longitude,
                },
            )

    legacy_nouakchott = Region.objects.filter(name="Nouakchott").first()
    if legacy_nouakchott and not City.objects.filter(region=legacy_nouakchott).exists():
        legacy_nouakchott.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0002_add_gorgol_toulel"),
    ]

    operations = [
        migrations.CreateModel(
            name="Department",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(blank=True, max_length=180, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("service_enabled", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("region", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="departments", to="locations.region")),
            ],
            options={"ordering": ["region__name", "name"]},
        ),
        migrations.CreateModel(
            name="Commune",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(blank=True, max_length=220, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("service_enabled", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("department", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="communes", to="locations.department")),
            ],
            options={"ordering": ["department__region__name", "department__name", "name"]},
        ),
        migrations.CreateModel(
            name="Locality",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=140)),
                ("slug", models.SlugField(blank=True, max_length=260, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("service_enabled", models.BooleanField(default=False)),
                ("latitude", models.FloatField(blank=True, null=True)),
                ("longitude", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("commune", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="localities", to="locations.commune")),
            ],
            options={"ordering": ["commune__department__region__name", "commune__department__name", "commune__name", "name"]},
        ),
        migrations.AddField(
            model_name="city",
            name="commune",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="service_cities", to="locations.commune"),
        ),
        migrations.AddConstraint(
            model_name="department",
            constraint=models.UniqueConstraint(fields=("region", "name"), name="unique_department_region_name"),
        ),
        migrations.AddConstraint(
            model_name="commune",
            constraint=models.UniqueConstraint(fields=("department", "name"), name="unique_commune_department_name"),
        ),
        migrations.AddConstraint(
            model_name="locality",
            constraint=models.UniqueConstraint(fields=("commune", "name"), name="unique_locality_commune_name"),
        ),
        migrations.RunPython(seed_administrative_hierarchy, migrations.RunPython.noop),
    ]
