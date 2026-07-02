"""
Unit tests for QRCodeService.

Tests the core signing and verification logic which doesn't require
database access or full Django model loading.
"""

import base64
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

import pytest


# We test the signing logic directly without Django setup since the
# core crypto logic is independent of the ORM.


class TestCreateSignedToken:
    """Tests for QRCodeService.create_signed_token"""

    @patch("taxi.drivers.services.qr_service.settings")
    def test_creates_valid_token_format(self, mock_settings):
        """Token should be in 'base64_payload.signature' format."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("test-uuid", "123456")

        # Token should have exactly one dot separating payload and signature
        parts = token.split(".")
        assert len(parts) == 2
        assert len(parts[0]) > 0  # payload
        assert len(parts[1]) > 0  # signature

    @patch("taxi.drivers.services.qr_service.settings")
    def test_payload_contains_uuid_and_driver_code(self, mock_settings):
        """Decoded payload should contain the uuid and driver_code."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("my-uuid-1234", "654321")

        payload_b64 = token.split(".")[0]
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        payload = json.loads(payload_json)

        assert payload["uuid"] == "my-uuid-1234"
        assert payload["driver_code"] == "654321"

    @patch("taxi.drivers.services.qr_service.settings")
    def test_signature_uses_hmac_sha256(self, mock_settings):
        """Signature should be a valid HMAC-SHA256 hex digest."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("uuid-abc", "111111")

        payload_b64, signature = token.split(".")

        # Verify signature length (SHA256 hex = 64 chars)
        assert len(signature) == 64

        # Verify it matches what we'd expect
        expected = hmac.new(
            key=b"test-secret-key",
            msg=payload_b64.encode(),
            digestmod=hashlib.sha256,
        ).hexdigest()
        assert signature == expected

    @patch("taxi.drivers.services.qr_service.settings")
    def test_different_inputs_produce_different_tokens(self, mock_settings):
        """Different uuid/driver_code combinations should produce different tokens."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token1 = svc.create_signed_token("uuid-1", "111111")
        token2 = svc.create_signed_token("uuid-2", "222222")

        assert token1 != token2


class TestVerifySignedToken:
    """Tests for QRCodeService.verify_signed_token"""

    @patch("taxi.drivers.services.qr_service.settings")
    def test_valid_token_returns_payload(self, mock_settings):
        """A correctly signed token should return the payload dict."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("uuid-123", "999999")
        result = svc.verify_signed_token(token)

        assert result is not None
        assert result["uuid"] == "uuid-123"
        assert result["driver_code"] == "999999"

    @patch("taxi.drivers.services.qr_service.settings")
    def test_tampered_signature_returns_none(self, mock_settings):
        """A token with a wrong signature should return None."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("uuid-123", "999999")

        # Tamper with the signature
        payload_b64, _ = token.split(".")
        tampered_token = f"{payload_b64}.{'a' * 64}"

        result = svc.verify_signed_token(tampered_token)
        assert result is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_tampered_payload_returns_none(self, mock_settings):
        """A token with a modified payload should fail verification."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        token = svc.create_signed_token("uuid-123", "999999")

        # Tamper with the payload
        _, signature = token.split(".")
        fake_payload = base64.urlsafe_b64encode(
            json.dumps({"uuid": "fake-uuid", "driver_code": "000000"}).encode()
        ).decode()
        tampered_token = f"{fake_payload}.{signature}"

        result = svc.verify_signed_token(tampered_token)
        assert result is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_empty_token_returns_none(self, mock_settings):
        """An empty string should return None."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        assert svc.verify_signed_token("") is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_none_token_returns_none(self, mock_settings):
        """None input should return None."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        assert svc.verify_signed_token(None) is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_no_dot_separator_returns_none(self, mock_settings):
        """A token without a dot should return None."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        assert svc.verify_signed_token("nodothere") is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_invalid_base64_returns_none(self, mock_settings):
        """A token with invalid base64 in the payload should return None."""
        mock_settings.SECRET_KEY = "test-secret-key"

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        # Create a token with valid signature but undecodable payload
        bad_payload = "not-valid-base64!!!"
        sig = hmac.new(
            key=b"test-secret-key",
            msg=bad_payload.encode(),
            digestmod=hashlib.sha256,
        ).hexdigest()
        token = f"{bad_payload}.{sig}"

        result = svc.verify_signed_token(token)
        assert result is None

    @patch("taxi.drivers.services.qr_service.settings")
    def test_wrong_secret_key_returns_none(self, mock_settings):
        """A token signed with a different key should fail verification."""
        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()

        # Create token with one key
        mock_settings.SECRET_KEY = "key-one"
        token = svc.create_signed_token("uuid-x", "111111")

        # Verify with different key
        mock_settings.SECRET_KEY = "key-two"
        result = svc.verify_signed_token(token)
        assert result is None


class TestGenerateUniqueUuid:
    """Tests for QRCodeService._generate_unique_uuid"""

    @patch("taxi.drivers.services.qr_service.DriverProfile")
    def test_returns_uuid_on_first_attempt(self, mock_model):
        """Should return a UUID when no collision occurs."""
        mock_model.objects.filter.return_value.exists.return_value = False

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        result = svc._generate_unique_uuid()

        assert result is not None
        assert len(result) == 36  # UUID format

    @patch("taxi.drivers.services.qr_service.DriverProfile")
    def test_retries_on_collision(self, mock_model):
        """Should retry when a UUID collision is detected."""
        # First two attempts collide, third succeeds
        mock_model.objects.filter.return_value.exists.side_effect = [
            True,
            True,
            False,
        ]

        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        result = svc._generate_unique_uuid()

        assert result is not None
        assert mock_model.objects.filter.call_count == 3

    @patch("taxi.drivers.services.qr_service.DriverProfile")
    def test_raises_after_max_attempts(self, mock_model):
        """Should raise QRGenerationError after 5 failed attempts."""
        mock_model.objects.filter.return_value.exists.return_value = True

        from taxi.drivers.services.qr_service import (
            QRCodeService,
            QRGenerationError,
        )

        svc = QRCodeService()

        with pytest.raises(QRGenerationError):
            svc._generate_unique_uuid()

        assert mock_model.objects.filter.call_count == 5


class TestRenderQrImage:
    """Tests for QRCodeService._render_qr_image"""

    def test_produces_png_bytes(self):
        """Should produce non-empty PNG bytes."""
        from taxi.drivers.services.qr_service import QRCodeService

        svc = QRCodeService()
        result = svc._render_qr_image("test-data-payload")

        assert isinstance(result, bytes)
        assert len(result) > 0
        # PNG files start with the PNG magic bytes
        assert result[:4] == b"\x89PNG"
