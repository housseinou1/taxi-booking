#!/usr/bin/env python3
"""Run on production: docker exec yala-django-1 python /tmp/test_production_ride_request.py"""
import json
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from taxi.rides.views import request_ride

User = get_user_model()
user = User.objects.filter(role="rider").first()
if not user:
    user = User.objects.filter(is_staff=False).first()
if not user:
    raise SystemExit("No user found")

factory = APIRequestFactory()
payload = {
    "pickup": "Sebkha",
    "destination": "Toujounine",
    "pickup_lat": 18.0735,
    "pickup_lng": -15.9582,
    "destination_lat": 18.0896,
    "destination_lng": -15.9754,
    "distance_km": 0,
    "distance": 0,
    "ride_type": "regular",
    "ride_terms_accepted": True,
    "terms_accepted": True,
    "privacy_accepted": True,
}

request = factory.post("/rides/request/", payload, format="json")
force_authenticate(request, user=user)
response = request_ride(request)
print("STATUS", response.status_code)
print("BODY", json.dumps(response.data, default=str)[:500])
