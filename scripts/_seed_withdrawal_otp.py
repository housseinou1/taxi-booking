from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta

from payments.models import DriverPayoutMethod, WithdrawalOTPCode, WithdrawalRequest

User = get_user_model()
email = "amadou.diallo@yala.mr"
code = "246810"
user = User.objects.get(email=email)
WithdrawalOTPCode.objects.filter(user=user, consumed_at__isnull=True).update(
    consumed_at=timezone.now()
)
WithdrawalOTPCode.objects.create(
    user=user,
    code_hash=make_password(code),
    expires_at=timezone.now() + timedelta(minutes=15),
)
pending = WithdrawalRequest.objects.filter(driver=user, status="pending").count()
pm = DriverPayoutMethod.objects.filter(driver=user, is_default=True).first()
print(
    f"seeded_otp user_id={user.id} code={code} pending={pending} "
    f"payout_id={getattr(pm, 'id', None)}"
)
