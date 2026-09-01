import os
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

email = os.getenv('YALA_TEST_EMAIL')
password = os.getenv('YALA_TEST_PASSWORD')

if not email or not password:
    print('Set YALA_TEST_EMAIL and YALA_TEST_PASSWORD', file=sys.stderr)
    sys.exit(1)

u = User.objects.filter(email__iexact=email).first()
if u:
    print('User found')
    print('Active:', u.is_active)
    print('Password check:', u.check_password(password))
else:
    print('User not found')
