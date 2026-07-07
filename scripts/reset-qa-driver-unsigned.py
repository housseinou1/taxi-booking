from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile

User = get_user_model()
u = User.objects.get(email="qa-driver-final-qa@test.local")
p = u.driver_profile
p.driver_terms_accepted = False
p.driver_terms_accepted_at = None
p.driver_terms_version = ""
p.driver_signed_full_name = ""
p.driver_legal_declaration_accepted = False
p.driver_signature_image = None
p.is_available = False
p.save()
print("unsigned_reset_ok")
