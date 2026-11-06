import os, django

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email__iexact='cheikh@yala.mr').exists():
    u = User(email='cheikh@yala.mr', first_name='Cheikh', last_name='Yala')
    u.set_password(_required_env("YALA_QA_DEFAULT_PASSWORD"))
    u.is_active = True
    u.save()
    print('User cheikh@yala.mr created successfully')
else:
    print('User already exists')
