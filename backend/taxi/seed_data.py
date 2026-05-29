"""
Seed script: creates sample riders, drivers, rides, and payments for testing.
Run with: python seed_data.py
"""
import os
import sys
import random
from datetime import timedelta
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

import django
django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from payments.models import Payment
from taxi.market import calculate_app_fee

User = get_user_model()

now = timezone.now()

# ─── Riders ───────────────────────────────────────────────────────────────────
RIDERS = [
    {"first_name": "Aminata", "last_name": "Diallo", "email": "aminata@rider.com"},
    {"first_name": "Fatima", "last_name": "Ba", "email": "fatima@rider.com"},
    {"first_name": "Oumar", "last_name": "Sy", "email": "oumar@rider.com"},
    {"first_name": "Mariam", "last_name": "Kane", "email": "mariam@rider.com"},
    {"first_name": "Ibrahim", "last_name": "Diop", "email": "ibrahim@rider.com"},
]

DRIVERS = [
    {"first_name": "Moussa", "last_name": "Soumare", "email": "moussa@driver.com"},
    {"first_name": "Cheikh", "last_name": "Ould", "email": "cheikh@driver.com"},
    {"first_name": "Abdoulaye", "last_name": "Ndiaye", "email": "abdoulaye@driver.com"},
]

LOCATIONS = [
    ("Sebkha", 18.0735, -15.9582),
    ("Toujounine", 18.0896, -15.9754),
    ("Arafat", 18.0466, -15.9657),
    ("Tevragh Zeina", 18.1194, -16.0019),
    ("Ksar", 18.1002, -15.9631),
    ("Dar Naim", 18.1018, -15.9307),
    ("El Mina", 18.0611, -15.9826),
]

RIDE_TYPES = ["Regular", "XL", "Comfort", "Share"]

print("Creating riders...")
rider_users = []
for r in RIDERS:
    user, created = User.objects.get_or_create(
        email=r["email"],
        defaults={
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "user_type": "rider",
            "phone_number": f"+2224{random.randint(1000000, 9999999)}",
            "rider_status": "approved",
            "profile_picture": "users/profile_pictures/test.jpg",
        },
    )
    if created:
        user.set_password("Test1234!")
        user.save()
    rider_users.append(user)
    print(f"  {'Created' if created else 'Exists'}: {user.email}")

print("\nCreating drivers...")
driver_users = []
for d in DRIVERS:
    user, created = User.objects.get_or_create(
        email=d["email"],
        defaults={
            "first_name": d["first_name"],
            "last_name": d["last_name"],
            "user_type": "driver",
            "phone_number": f"+2224{random.randint(1000000, 9999999)}",
            "rider_status": "approved",
            "profile_picture": "users/profile_pictures/test.jpg",
        },
    )
    if created:
        user.set_password("Test1234!")
        user.save()
    driver_users.append(user)

    profile, p_created = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "status": "approved",
            "is_available": True,
            "car_type": random.choice(["regular", "xl", "comfort"]),
            "driver_category": random.choice(["gold", "platinum", "diamond"]),
            "vehicle_make": random.choice(["Toyota", "Hyundai", "Renault"]),
            "vehicle_model": random.choice(["Corolla", "Accent", "Logan"]),
            "vehicle_color": random.choice(["White", "Black", "Silver", "Blue"]),
            "vehicle_plate": f"NKT-{random.randint(1000, 9999)}",
            "plate_number": f"NKT-{random.randint(1000, 9999)}",
            "terms_accepted": True,
            "terms_accepted_at": now,
        },
    )
    if not p_created:
        profile.status = "approved"
        profile.is_available = True
        profile.save()
    print(f"  {'Created' if created else 'Exists'}: {user.email} (profile: {profile.status})")

print("\nCreating 10 completed rides...")
completed_rides = []
for i in range(10):
    rider = random.choice(rider_users)
    driver = random.choice(driver_users)
    pickup_loc = random.choice(LOCATIONS)
    dest_loc = random.choice([l for l in LOCATIONS if l != pickup_loc])
    ride_type = random.choice(RIDE_TYPES)
    distance = round(random.uniform(2, 15), 1)
    fare = Decimal(str(round(200 + distance * 20 + random.uniform(0, 100), 2)))
    app_fee = calculate_app_fee(fare)
    driver_earning = fare - app_fee

    days_ago = random.randint(0, 25)
    completed_at = now - timedelta(days=days_ago, hours=random.randint(1, 12))

    ride = Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup=pickup_loc[0],
        destination=dest_loc[0],
        pickup_lat=pickup_loc[1],
        pickup_lng=pickup_loc[2],
        destination_lat=dest_loc[1],
        destination_lng=dest_loc[2],
        ride_type=ride_type,
        distance_km=Decimal(str(distance)),
        fare=fare,
        app_fee=app_fee,
        driver_earning=driver_earning,
        status="completed",
        completed_at=completed_at,
        rating=random.randint(3, 5),
    )
    ride.created_at = completed_at - timedelta(minutes=random.randint(10, 40))
    Ride.objects.filter(id=ride.id).update(created_at=ride.created_at)
    completed_rides.append(ride)
    print(f"  Ride #{ride.id}: {ride.pickup} -> {ride.destination} | {fare} MRU | {days_ago}d ago")

print("\nCreating 3 active rides...")
active_statuses = ["requested", "driver_arriving", "in_progress"]
for i, status in enumerate(active_statuses):
    rider = rider_users[i % len(rider_users)]
    driver = driver_users[i % len(driver_users)] if status != "requested" else None
    pickup_loc = LOCATIONS[i]
    dest_loc = LOCATIONS[(i + 3) % len(LOCATIONS)]
    distance = round(random.uniform(3, 10), 1)
    fare = Decimal(str(round(200 + distance * 20, 2)))
    app_fee = calculate_app_fee(fare)
    driver_earning = fare - app_fee

    ride = Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup=pickup_loc[0],
        destination=dest_loc[0],
        pickup_lat=pickup_loc[1],
        pickup_lng=pickup_loc[2],
        destination_lat=dest_loc[1],
        destination_lng=dest_loc[2],
        ride_type="Regular",
        distance_km=Decimal(str(distance)),
        fare=fare,
        app_fee=app_fee,
        driver_earning=driver_earning,
        status=status,
    )
    print(f"  Ride #{ride.id}: {status} | {ride.pickup} -> {ride.destination}")

print("\nCreating payment records for completed rides...")
for ride in completed_rides:
    Payment.objects.get_or_create(
        ride_id=ride.id,
        defaults={
            "rider": ride.rider,
            "amount": ride.fare,
            "app_fee": ride.app_fee,
            "driver_earning": ride.driver_earning,
            "tip_percentage": Decimal("0"),
            "tip_amount": Decimal("0"),
            "method": random.choice(["cash", "bankily", "masrvi", "card"]),
            "status": "paid",
            "transaction_id": f"PAY-SEED-{ride.id}",
        },
    )
print(f"  {len(completed_rides)} payment records created.")

print("\n" + "=" * 60)
print("SEED DATA SUMMARY")
print("=" * 60)
print(f"  Riders:          {User.objects.filter(user_type='rider').count()}")
print(f"  Drivers:         {DriverProfile.objects.count()}")
print(f"  Total rides:     {Ride.objects.count()}")
print(f"  Completed rides: {Ride.objects.filter(status='completed').count()}")
print(f"  Active rides:    {Ride.objects.filter(status__in=['requested','driver_arriving','in_progress']).count()}")
print(f"  Payments:        {Payment.objects.count()}")
print(f"  Total revenue:   {sum(r.fare for r in completed_rides)} MRU")
print("=" * 60)
print("\nLogin credentials (all passwords: Test1234!):")
print("  Admin:   admin@sakho.com / Admin123!")
for r in RIDERS:
    print(f"  Rider:   {r['email']}")
for d in DRIVERS:
    print(f"  Driver:  {d['email']}")
print("\nDone!")
