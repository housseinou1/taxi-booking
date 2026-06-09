import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxi.settings')
django.setup()
from django.urls import get_resolver
for p in get_resolver().url_patterns:
    print(p.pattern)
