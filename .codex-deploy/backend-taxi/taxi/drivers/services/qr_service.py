"""
QR Code Service

Generates cryptographically signed QR codes for approved drivers,
verifies QR token signatures, and handles QR code regeneration.

Requirements: 1.1, 1.2, 1.3, 1.5, 5.4, 5.6, 5.7, 7.3
"""

import base64
import hashlib
import hmac
import io
import json
import logging
import uuid
from typing import Optional

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from taxi.drivers.models import DriverProfile, QRCodeAuditLog

logger = logging.getLogger(__name__)

MAX_UUID_ATTEMPTS = 5


class QRGenerationError(Exception):
    """Raised when QR code generation fails after maximum uniqueness attempts."""

    pass


class QRCodeService:
    """
    Service responsible for generating, signing, verifying, and managing
    QR codes for driver profiles.
    """

    def create_signed_token(self, qr_uuid: str, driver_code: str) -> str:
        """
        Create an HMAC-SHA256 signed token.

        Format: base64(json({uuid, driver_code})).signature

        Args:
            qr_uuid: The unique UUID identifier for the QR code.
            driver_code: The driver's 6-digit code.

        Returns:
            A signed token string in the format 'base64_payload.signature'.
        """
        payload = json.dumps(
            {"uuid": qr_uuid, "driver_code": driver_code},
            separators=(",", ":"),
        )
        payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()

        signature = hmac.new(
            key=settings.SECRET_KEY.encode(),
            msg=payload_b64.encode(),
            digestmod=hashlib.sha256,
        ).hexdigest()

        return f"{payload_b64}.{signature}"

    def verify_signed_token(self, token: str) -> Optional[dict]:
        """
        Verify a signed token's HMAC-SHA256 signature and return the payload.

        Args:
            token: The signed token string in 'base64_payload.signature' format.

        Returns:
            A dict with 'uuid' and 'driver_code' keys if valid, or None if
            the token is malformed or the signature is invalid.
        """
        if not token or "." not in token:
            return None

        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return None

        payload_b64, signature = parts

        # Verify the signature
        expected_signature = hmac.new(
            key=settings.SECRET_KEY.encode(),
            msg=payload_b64.encode(),
            digestmod=hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            return None

        # Decode the payload
        try:
            payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
            payload = json.loads(payload_json)
        except (ValueError, json.JSONDecodeError):
            return None

        # Validate payload structure
        if not isinstance(payload, dict):
            return None
        if "uuid" not in payload or "driver_code" not in payload:
            return None

        return payload

    def generate_qr_code(
        self, driver_profile: DriverProfile
    ) -> tuple[str, str]:
        """
        Generate a QR code for a driver profile.

        Generates a UUID4 identifier, ensures uniqueness (up to 5 attempts),
        creates a signed token, renders a QR code image, and stores it via
        Django file storage.

        Args:
            driver_profile: The DriverProfile instance to generate a QR code for.

        Returns:
            A tuple of (qr_uuid, image_path).

        Raises:
            QRGenerationError: If a unique UUID cannot be generated after 5 attempts.
        """
        qr_uuid = self._generate_unique_uuid()
        driver_code = driver_profile.driver_code or ""

        # Create the signed token
        token = self.create_signed_token(qr_uuid, driver_code)

        # Generate QR code image
        image_bytes = self._render_qr_image(token)

        # Store the image via Django file storage
        filename = f"drivers/qr_codes/{qr_uuid}.png"
        image_file = ContentFile(image_bytes, name=f"{qr_uuid}.png")
        image_path = default_storage.save(filename, image_file)

        # Update the driver profile without triggering post_save signals
        DriverProfile.objects.filter(pk=driver_profile.pk).update(
            qr_code_uuid=qr_uuid,
            qr_code_image=image_path,
            qr_code_generated_at=timezone.now(),
        )
        # Refresh the in-memory instance
        driver_profile.qr_code_uuid = qr_uuid
        driver_profile.qr_code_image = image_path
        driver_profile.qr_code_generated_at = timezone.now()

        return (qr_uuid, image_path)

    def regenerate_qr_code(
        self, driver_profile: DriverProfile, admin_user
    ) -> tuple[str, str]:
        """
        Generate a new QR code for a driver, invalidating the old one.

        Creates a new QR code, replaces the existing one on the driver profile,
        and logs the action in QRCodeAuditLog.

        Args:
            driver_profile: The DriverProfile instance.
            admin_user: The admin User performing the regeneration.

        Returns:
            A tuple of (new_qr_uuid, new_image_path).

        Raises:
            QRGenerationError: If a unique UUID cannot be generated after 5 attempts.
        """
        old_qr_uuid = driver_profile.qr_code_uuid

        # Generate new QR code (this updates the profile)
        new_qr_uuid, new_image_path = self.generate_qr_code(driver_profile)

        # Create audit log entry
        QRCodeAuditLog.objects.create(
            admin=admin_user,
            driver=driver_profile,
            action="regenerated",
            old_qr_uuid=old_qr_uuid,
            new_qr_uuid=new_qr_uuid,
        )

        return (new_qr_uuid, new_image_path)

    def _generate_unique_uuid(self) -> str:
        """
        Generate a unique UUID4 string, checking against existing records.

        Attempts up to MAX_UUID_ATTEMPTS times to find a UUID that doesn't
        already exist in the database.

        Returns:
            A unique UUID string.

        Raises:
            QRGenerationError: If uniqueness cannot be achieved after max attempts.
        """
        for attempt in range(MAX_UUID_ATTEMPTS):
            qr_uuid = str(uuid.uuid4())
            if not DriverProfile.objects.filter(qr_code_uuid=qr_uuid).exists():
                return qr_uuid

        logger.error(
            "Failed to generate unique QR code UUID after %d attempts",
            MAX_UUID_ATTEMPTS,
        )
        raise QRGenerationError(
            f"Could not generate unique QR code after {MAX_UUID_ATTEMPTS} attempts"
        )

    def _render_qr_image(self, data: str) -> bytes:
        """
        Render a QR code image as PNG bytes.

        Uses Pillow if available, otherwise falls back to pypng via
        qrcode's pure-Python PNG factory.

        Args:
            data: The string data to encode in the QR code.

        Returns:
            PNG image bytes.
        """
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)

        buffer = io.BytesIO()

        try:
            # Prefer Pillow-based image rendering (production)
            img = qr.make_image(fill_color="black", back_color="white")
            img.save(buffer, format="PNG")
        except ImportError:
            # Fall back to pypng-based rendering
            from qrcode.image.pure import PyPNGImage

            img = qr.make_image(image_factory=PyPNGImage)
            img.save(buffer)

        return buffer.getvalue()
