from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from ..models import PasswordResetCode, User


@override_settings(DEBUG=True, YALA_SMS_PROVIDER="console")
class PasswordResetOtpTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reset.rider@example.com",
            password="StrongPass123!",
            first_name="Reset",
            last_name="Rider",
            phone_number="+22222334455",
            national_id_number="9876543211",
        )

    def test_phone_reset_code_resets_password_and_blacklists_refresh_tokens(self):
        login_response = self.client.post(
            "/auth/login/",
            {"email": self.user.email, "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertTrue(OutstandingToken.objects.filter(user=self.user).exists())

        response = self.client.post(
            "/auth/forgot-password/",
            {"phone": "+222 22 33 44 55"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["delivery_method"], "sms")

        code = response.data["debug_code"]
        response = self.client.post(
            "/auth/verify-reset-code/",
            {"phone": "+22222334455", "code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/auth/reset-password/",
            {
                "phone": "+22222334455",
                "code": code,
                "new_password": "NewStrongPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPass123!"))
        self.assertTrue(
            BlacklistedToken.objects.filter(token__user=self.user).exists()
        )

    def test_bad_code_counts_attempts(self):
        response = self.client.post(
            "/auth/forgot-password/",
            {"email": self.user.email},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/auth/verify-reset-code/",
            {"email": self.user.email, "code": "000000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        reset_code = PasswordResetCode.objects.get(user=self.user)
        self.assertEqual(reset_code.attempts, 1)
