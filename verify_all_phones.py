from django.contrib.auth import get_user_model
from django.utils import timezone
U = get_user_model()
drivers = U.objects.filter(user_type="driver").order_by("-id")[:5]
for u in drivers:
    print(f"{u.email} | phone: {u.phone_number} | verified: {u.is_phone_verified} | active: {u.is_active}")
    if not u.is_phone_verified:
        u.phone_verified_at = timezone.now()
        u.save(update_fields=["phone_verified_at"])
        print(f"  -> NOW VERIFIED")
