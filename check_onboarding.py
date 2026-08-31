from django.contrib.auth import get_user_model
from django.test import RequestFactory
from deliveries.courier_onboarding import build_courier_onboarding_state
U = get_user_model()
u = U.objects.get(email="mass.sakho@yala.mr")
factory = RequestFactory()
request = factory.get("/deliveries/courier/onboarding/")
request.user = u
state = build_courier_onboarding_state(request)
print(f"ready: {state.get('ready')}")
print(f"phone_verified: {state.get('phone_verified')}")
print(f"driver_status: {state.get('driver_status')}")
for k, v in state.items():
    if isinstance(v, (bool, str, int, float, type(None))):
        print(f"  {k}: {v}")
