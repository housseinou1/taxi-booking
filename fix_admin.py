import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.filter(email='admin@sakho.com').first()
if u:
    print(f'User: {u.email}')
    print(f'is_staff: {u.is_staff}')
    print(f'is_superuser: {u.is_superuser}')
    print(f'is_active: {u.is_active}')
    print(f'Password check Admin1234!: {u.check_password("Admin1234!")}')
    if not u.is_staff or not u.is_superuser:
        u.is_staff = True
        u.is_superuser = True
        u.save()
        print('Fixed: set is_staff and is_superuser to True')
else:
    print('User admin@sakho.com not found')
