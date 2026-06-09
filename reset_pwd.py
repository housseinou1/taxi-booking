import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(email='admin@sakho.com')
u.set_password('Admin1234!')
u.save()
print('Password reset to Admin1234! for admin@sakho.com')
