import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile

User = get_user_model()
u = User.objects.get(email='cheikh@yala.mr')
u.first_name = 'Cheikh'
u.last_name = 'Diallo'
u.save()

profile, created = DriverProfile.objects.get_or_create(user=u)
profile.status = 'approved'
profile.is_available = True
profile.driver_category = 'standard'
profile.save()

print(f'Driver profile for {u.first_name} {u.last_name}:')
print(f'  Status: {profile.status}')
print(f'  Available: {profile.is_available}')
print(f'  Category: {profile.driver_category}')
print('Done!')
