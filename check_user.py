import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.filter(email__iexact='cheikh@yala.mr').first()
if u:
    print('Found: True')
    print('Active:', u.is_active)
else:
    print('Found: False - user does not exist')
    print('All users:')
    for x in User.objects.all()[:10]:
        print(f'  {x.email} active={x.is_active}')
