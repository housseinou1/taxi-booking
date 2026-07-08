import pyotp

from django.conf import settings
from django.db import models
from django.utils import timezone


class AdminTOTP(models.Model):
    """TOTP secret for admin accounts. One record per admin user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="admin_totp",
    )
    secret = models.CharField(max_length=64)
    is_confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Admin TOTP"

    def __str__(self):
        return f"TOTP — {self.user_id} (confirmed={self.is_confirmed})"

    def get_totp(self):
        return pyotp.TOTP(self.secret)

    def verify(self, code: str) -> bool:
        return self.get_totp().verify(code, valid_window=1)

    def provisioning_uri(self, issuer="Yala Admin") -> str:
        return self.get_totp().provisioning_uri(
            name=self.user.email,
            issuer_name=issuer,
        )
