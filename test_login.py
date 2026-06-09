import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.filter(email__iexact='cheikh@yala.mr').first()
if u:
    print('User found:', u.email)
    print('Active:', u.is_active)
    print('Password check:', u.check_password('Test1234!'))
else:
    print('User not found')
