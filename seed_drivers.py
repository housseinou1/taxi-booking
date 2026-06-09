import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()

from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile, DriverSettings

User = get_user_model()

# Keep admin, delete everything else
admin = User.objects.filter(email='admin@sakho.com').first()
User.objects.exclude(email='admin@sakho.com').delete()
print('Cleaned database (kept admin@sakho.com)')

# 5 Mauritanian drivers
drivers_data = [
    {
        'email': 'moussa.diallo@yala.mr',
        'password': 'Driver2026!',
        'first_name': 'Moussa',
        'last_name': 'Diallo',
        'phone_number': '+22237001122',
        'vehicle_make': 'Toyota',
        'vehicle_model': 'Corolla 2021',
        'vehicle_color': 'Blanc',
        'vehicle_plate': '1234 AA 01',
        'car_type': 'regular',
        'driver_category': 'gold',
        'driver_level': 'silver',
        'total_rides_completed': 152,
        'average_rating': 4.75,
        'current_lat': 18.0863,
        'current_lng': -15.9785,
    },
    {
        'email': 'amadou.ba@yala.mr',
        'password': 'Driver2026!',
        'first_name': 'Amadou',
        'last_name': 'Ba',
        'phone_number': '+22236112233',
        'vehicle_make': 'Hyundai',
        'vehicle_model': 'Accent 2022',
        'vehicle_color': 'Gris',
        'vehicle_plate': '5678 BB 02',
        'car_type': 'comfort',
        'driver_category': 'platinum',
        'driver_level': 'gold',
        'total_rides_completed': 310,
        'average_rating': 4.88,
        'current_lat': 18.0735,
        'current_lng': -15.9582,
    },
    {
        'email': 'fatimata.mint@yala.mr',
        'password': 'Driver2026!',
        'first_name': 'Fatimata',
        'last_name': 'Mint Ahmed',
        'phone_number': '+22234223344',
        'vehicle_make': 'Kia',
        'vehicle_model': 'Picanto 2023',
        'vehicle_color': 'Rouge',
        'vehicle_plate': '9012 CC 03',
        'car_type': 'regular',
        'driver_category': 'gold',
        'driver_level': 'bronze',
        'total_rides_completed': 45,
        'average_rating': 4.60,
        'current_lat': 18.0920,
        'current_lng': -15.9650,
    },
    {
        'email': 'oumar.sy@yala.mr',
        'password': 'Driver2026!',
        'first_name': 'Oumar',
        'last_name': 'Sy',
        'phone_number': '+22233445566',
        'vehicle_make': 'Renault',
        'vehicle_model': 'Logan 2020',
        'vehicle_color': 'Noir',
        'vehicle_plate': '3456 DD 04',
        'car_type': 'xl',
        'driver_category': 'diamond',
        'driver_level': 'platinum',
        'total_rides_completed': 520,
        'average_rating': 4.92,
        'current_lat': 18.0650,
        'current_lng': -15.9480,
    },
    {
        'email': 'cheikh.sow@yala.mr',
        'password': 'Driver2026!',
        'first_name': 'Cheikh',
        'last_name': 'Sow',
        'phone_number': '+22238556677',
        'vehicle_make': 'Toyota',
        'vehicle_model': 'Yaris 2022',
        'vehicle_color': 'Bleu',
        'vehicle_plate': '7890 EE 05',
        'car_type': 'comfort',
        'driver_category': 'platinum',
        'driver_level': 'gold',
        'total_rides_completed': 275,
        'average_rating': 4.80,
        'current_lat': 18.0800,
        'current_lng': -15.9700,
    },
]

for d in drivers_data:
    user = User(
        email=d['email'],
        first_name=d['first_name'],
        last_name=d['last_name'],
        phone_number=d['phone_number'],
        is_active=True,
    )
    user.set_password(d['password'])
    user.save()

    profile = DriverProfile.objects.create(
        user=user,
        status='approved',
        is_available=True,
        phone_number=d['phone_number'],
        car_type=d['car_type'],
        driver_category=d['driver_category'],
        driver_level=d['driver_level'],
        vehicle_make=d['vehicle_make'],
        vehicle_model=d['vehicle_model'],
        vehicle_color=d['vehicle_color'],
        vehicle_plate=d['vehicle_plate'],
        plate_number=d['vehicle_plate'],
        total_rides_completed=d['total_rides_completed'],
        average_rating=d['average_rating'],
        current_lat=d['current_lat'],
        current_lng=d['current_lng'],
        driver_lat=d['current_lat'],
        driver_lng=d['current_lng'],
        terms_accepted=True,
    )

    DriverSettings.objects.create(
        driver=profile,
        language='fr',
        notifications_rides=True,
        notifications_promotions=True,
        notifications_system=True,
    )

    print(f'  Created: {d["first_name"]} {d["last_name"]} | {d["vehicle_make"]} {d["vehicle_model"]} ({d["vehicle_color"]}) | {d["vehicle_plate"]} | {d["phone_number"]}')

print('\nDone! 5 drivers created. All passwords: Driver2026!')
