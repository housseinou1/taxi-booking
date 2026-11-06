import django, os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()
from django.db.models import Count, Q
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from payments.models import WithdrawalRequest
from authapp.models import DeviceSession
rows = (Ride.objects.filter(status="completed", driver__isnull=False)
        .values("driver_id").annotate(n=Count("id")).order_by("-n")[:15])
for r in rows:
    p = DriverProfile.objects.filter(user_id=r["driver_id"]).first()
    if not p:
        continue
    w = WithdrawalRequest.objects.filter(driver_id=r["driver_id"]).count()
    s = DeviceSession.objects.filter(user_id=r["driver_id"]).count()
    print(f"profile_id={p.id} user_id={r['driver_id']} completed={r['n']} withdrawals={w} sessions={s} email={p.user.email}")
