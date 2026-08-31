import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()
from django.contrib.auth import get_user_model
from django.utils import timezone
U = get_user_model()
u = U.objects.filter(user_type="driver").order_by("-id").first()
print(f"User: {u.email} | Phone: {u.phone_number} | Verified: {u.is_phone_verified}")
u.phone_verified_at = timezone.now()
u.save(update_fields=["phone_verified_at"])
print("Phone verified successfully!")
