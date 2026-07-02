import os, django, sys
# Try both local and production directory structures
if os.path.exists(os.path.join(os.path.dirname(__file__), 'backend', 'taxi')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend', 'taxi'))
else:
    sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

# 2 Delivery persons with password Test1234!
delivery_persons_data = [
    {
        'email': 'courier1@yala.mr',
        'password': 'Test1234!',
        'first_name': 'Ahmed',
        'last_name': 'Mint',
        'phone_number': '+22237001123',
    },
    {
        'email': 'courier2@yala.mr',
        'password': 'Test1234!',
        'first_name': 'Fatou',
        'last_name': 'Bamba',
        'phone_number': '+22236112234',
    },
]

from deliveries.courier_onboarding import ensure_driver_profile_for_courier
from deliveries.models import DriverDeliverySettings

for person in delivery_persons_data:
    user = User.objects.filter(email__iexact=person['email']).first()
    if user:
        changed = False
        if user.user_type != 'driver':
            user.user_type = 'driver'
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if changed:
            user.save()
            print(f'Updated user: {person["email"]} -> user_type=driver')
        else:
            print(f'User {person["email"]} already exists as courier driver, skipping...')
        ensure_driver_profile_for_courier(user)
        DriverDeliverySettings.objects.get_or_create(driver=user)
        continue

    user = User(
        email=person['email'],
        first_name=person['first_name'],
        last_name=person['last_name'],
        phone_number=person['phone_number'],
        is_active=True,
        user_type='driver',
    )
    user.set_password(person['password'])
    user.save()
    ensure_driver_profile_for_courier(user)
    DriverDeliverySettings.objects.get_or_create(driver=user)

    print(f'Created user: {person["first_name"]} {person["last_name"]} | {person["email"]} | user_type=driver')

print('\nDone! 2 users created. All passwords: Test1234!')
