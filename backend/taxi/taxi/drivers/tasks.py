"""
Celery tasks for the drivers app.

Provides async QR code generation triggered by driver approval signals.

Requirements: 1.1, 1.4, 1.5, 1.6
"""

import logging

from celery import shared_task
from django.core.management import call_command

from taxi.drivers.services.qr_service import QRCodeService, QRGenerationError

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def generate_qr_code_task(self, driver_profile_id: int) -> None:
    """
    Async QR code generation triggered by the driver approval signal.

    Generates a cryptographically signed QR code for the given driver profile.
    On failure, logs the error, reverts the driver's status, and raises
    an exception to trigger Celery retry.

    Args:
        driver_profile_id: The primary key of the DriverProfile to generate
                           a QR code for.
    """
    from taxi.drivers.models import DriverProfile

    try:
        driver_profile = DriverProfile.objects.get(pk=driver_profile_id)
    except DriverProfile.DoesNotExist:
        logger.error(
            "generate_qr_code_task: DriverProfile with id=%s does not exist.",
            driver_profile_id,
        )
        return

    # Skip if QR code already exists
    if driver_profile.qr_code_uuid:
        logger.info(
            "generate_qr_code_task: DriverProfile id=%s already has a QR code. Skipping.",
            driver_profile_id,
        )
        return

    service = QRCodeService()

    try:
        qr_uuid, image_path = service.generate_qr_code(driver_profile)
        logger.info(
            "generate_qr_code_task: Successfully generated QR code %s for DriverProfile id=%s.",
            qr_uuid,
            driver_profile_id,
        )
    except QRGenerationError as exc:
        logger.error(
            "generate_qr_code_task: QR generation failed for DriverProfile id=%s: %s",
            driver_profile_id,
            str(exc),
        )
        # Revert the driver's status to pending since QR generation failed
        driver_profile.status = "pending"
        driver_profile.save(update_fields=["status"])
        logger.warning(
            "generate_qr_code_task: Reverted DriverProfile id=%s status to 'pending'.",
            driver_profile_id,
        )
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@shared_task
def notify_expiring_driver_documents_task() -> None:
    """Run daily 30-day renewal reminders for expiring driver documents."""
    call_command("notify_expiring_driver_documents")
