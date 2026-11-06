"""
Run this on the production server to create an admin account:
    python manage.py shell < create_admin.py

Or copy-paste into: python manage.py shell
"""
from django.contrib.auth import get_user_model

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value


User = get_user_model()

email = _required_env("YALA_CEO_EMAIL")
password = _required_env("YALA_CEO_PASSWORD")

# Create or get the user
user, created = User.objects.get_or_create(
    email=email,
    defaults={
        "first_name": "Sakho",
        "last_name": "Admin",
        "is_staff": True,
        "is_superuser": True,
        "is_active": True,
    }
)

if not created:
    # User already exists - promote to admin
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True

user.set_password(password)
user.save()

print(f"Admin account ready: {email}")
print(f"  is_staff: {user.is_staff}")
print(f"  is_superuser: {user.is_superuser}")
print(f"  Created: {created}")
