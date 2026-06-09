import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email__iexact='cheikh@yala.mr').exists():
    u = User(email='cheikh@yala.mr', first_name='Cheikh', last_name='Yala')
    u.set_password('Test1234!')
    u.is_active = True
    u.save()
    print('User cheikh@yala.mr created successfully')
else:
    print('User already exists')
