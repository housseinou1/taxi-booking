import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
import django
django.setup()
from notifications.push import _get_firebase_app
app = _get_firebase_app()
print(f"Firebase initialized: {app is not None}")
