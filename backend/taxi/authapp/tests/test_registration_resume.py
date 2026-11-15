"""Driver registration resume / recovery tests.

Covers the Aboubacri Sy incident class: a driver registers, the OTP SMS never
arrives, and a second registration attempt dead-ends on "already registered".
The fix guarantees that:
- the duplicate error points the user at sign-in / account recovery;
- an unverified account can still sign in and resume at ``verify_phone``;
- no duplicate User/DriverProfile rows are ever created;
- OTP security is unchanged (codes are hashed, throttled, expiring).
"""

from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from authapp.models import PhoneVerificationCode, User
from cities.models import City as CitiesCity, Region as CitiesRegion
from taxi.drivers.models import DriverProfile


def _make_operational_city():
    """Create the Nouakchott operational city the registration serializer
    requires (get_operational_cities_queryset)."""
    region, _ = CitiesRegion.objects.get_or_create(name="Nouakchott")
    city, _ = CitiesCity.objects.get_or_create(
        name="Nouakchott",
        defaults={"region": region, "is_active": True},
    )
    return city


def _driver_payload(city, **overrides):
    data = {
        "first_name": "Aboubacri",
        "last_name": "Sy",
        "email": "driver@example.com",
        "phone_number": "22334455",
        "national_id_number": "1987654321",
        "password": "StrongPass123!",
        "user_type": "driver",
        "gender": "Male",
        "city": city.pk,
    }
    data.update(overrides)
    return data


@override_settings(DEBUG=True, YALA_SMS_PROVIDER="console")
class RegistrationResumeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.city = _make_operational_city()

    def _register(self, **overrides):
        return self.client.post(
            "/auth/register/",
            data=_driver_payload(self.city, **overrides),
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )

    def _login(self):
        return self.client.post(
            "/auth/login/",
            {"email": "driver@example.com", "password": "StrongPass123!"},
            format="json",
        )

    # --- Mandatory: first-time driver registration -------------------------
    def test_first_time_driver_registration(self):
        response = self._register()
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="driver@example.com")
        self.assertEqual(user.user_type, "driver")
        self.assertFalse(user.is_phone_verified)
        profile = DriverProfile.objects.get(user=user)
        self.assertEqual(profile.status, "pending")
        self.assertEqual(response.data["next_step"], "sign_in_and_verify_phone")

    # --- Mandatory: failed SMS delivery ------------------------------------
    def test_failed_sms_delivery_returns_honest_503(self):
        self._register()
        user = User.objects.get(email="driver@example.com")
        self.client.force_authenticate(user)
        with patch("authapp.phone_views.send_sms", side_effect=RuntimeError("provider down")):
            response = self.client.post("/auth/phone/request-code/", {})
        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.data["sms_failed"])
        user.refresh_from_db()
        self.assertFalse(user.is_phone_verified)

    # --- Mandatory: interrupted before OTP → resume via sign-in ------------
    def test_interrupted_registration_resumes_at_verify_phone(self):
        self._register()
        login = self._login()
        self.assertEqual(login.status_code, 200, login.data)
        self.assertIn("access", login.data)
        self.assertFalse(login.data["phone_verified"])
        self.assertEqual(login.data["onboarding"]["resume_step"], "verify_phone")
        self.assertFalse(login.data["onboarding"]["registration_complete"])

    # --- Mandatory: re-register same email → guided error, no duplicates ---
    def test_duplicate_email_guides_to_sign_in(self):
        self._register()
        response = self._register(phone_number="33445566", national_id_number="2233445566")
        self.assertEqual(response.status_code, 400)
        message = str(response.data)
        self.assertIn("already registered", message)
        self.assertIn("Sign in", message)
        self.assertIn("Connectez-vous", message)  # French
        self.assertIn("الدخول", message)  # Arabic
        self.assertEqual(User.objects.filter(email="driver@example.com").count(), 1)
        self.assertEqual(DriverProfile.objects.count(), 1)

    def test_duplicate_phone_guides_to_sign_in(self):
        self._register()
        response = self._register(email="other@example.com", national_id_number="2233445566")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already registered", str(response.data))
        self.assertIn("Sign in", str(response.data))
        self.assertIn("Connectez-vous", str(response.data))
        self.assertIn("الدخول", str(response.data))

    # --- Mandatory: secure account recovery ---------------------------------
    def test_unverified_user_can_use_forgot_password(self):
        self._register()
        response = self.client.post(
            "/auth/forgot-password/",
            {"email": "driver@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["delivery_method"], "email")

    # --- Mandatory: OTP resend (throttled, then succeeds) -------------------
    def test_otp_resend_throttle_then_success(self):
        self._register()
        user = User.objects.get(email="driver@example.com")
        self.client.force_authenticate(user)

        first = self.client.post("/auth/phone/request-code/", {})
        self.assertEqual(first.status_code, 200, first.data)

        throttled = self.client.post("/auth/phone/request-code/", {})
        self.assertEqual(throttled.status_code, 429)

        # Simulate the 60s cooldown elapsing.
        cache.delete(f"phone-verification:{user.id}")
        second = self.client.post("/auth/phone/request-code/", {})
        self.assertEqual(second.status_code, 200, second.data)
        # Only the newest code is usable; the first was invalidated on resend.
        active = PhoneVerificationCode.objects.filter(user=user, consumed_at__isnull=True)
        self.assertEqual(active.count(), 1)

    # --- Mandatory: resuming completes verification, then onboarding -------
    def test_resume_verifies_and_continues_onboarding(self):
        self._register()
        user = User.objects.get(email="driver@example.com")
        self.client.force_authenticate(user)

        sent = self.client.post("/auth/phone/request-code/", {})
        verify = self.client.post(
            "/auth/phone/verify/", {"code": sent.data["debug_code"]}, format="json"
        )
        self.assertEqual(verify.status_code, 200, verify.data)
        user.refresh_from_db()
        self.assertTrue(user.is_phone_verified)

        # Onboarding state now routes to profile completion, and previously
        # submitted data (name, phone, national id, city) is preserved.
        me = self.client.get("/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["onboarding"]["resume_step"], "complete_profile")
        self.assertEqual(me.data["phone_number"], user.phone_number)
        self.assertEqual(me.data["city"], self.city.pk)

        profile = DriverProfile.objects.get(user=user)
        self.assertEqual(profile.status, "pending")  # awaiting docs + approval

    # --- Mandatory: duplicate-account prevention across phone + national id -
    def test_no_duplicate_rows_on_repeated_attempts(self):
        self._register()
        for overrides in (
            {"phone_number": "33445566", "national_id_number": "2987654321"},
            {"email": "other@example.com", "national_id_number": "2987654321"},
            {"email": "other@example.com", "phone_number": "33445566"},
        ):
            self._register(**overrides)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(DriverProfile.objects.count(), 1)

    # --- Mandatory: dashboard access after mandatory requirements -----------
    def test_driver_dashboard_reflects_state_after_verify(self):
        self._register()
        user = User.objects.get(email="driver@example.com")
        self.client.force_authenticate(user)

        sent = self.client.post("/auth/phone/request-code/", {})
        self.client.post(
            "/auth/phone/verify/", {"code": sent.data["debug_code"]}, format="json"
        )
        dashboard = self.client.get("/drivers/me/")
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        # Still pending admin approval / document completion — not auto-approved.
        self.assertIn(dashboard.data["status"], ("pending", "pending_review"))
        # Resume state is exposed via /auth/me/ — verified phone routes onward.
        me = self.client.get("/auth/me/")
        self.assertTrue(me.data["phone_verified"])
        self.assertEqual(me.data["onboarding"]["resume_step"], "complete_profile")
