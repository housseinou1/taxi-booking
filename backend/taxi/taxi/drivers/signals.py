"""
Django signals for the drivers app.

Listens to post_save on DriverProfile to trigger QR code generation
when a driver's status transitions to "approved".

Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.2
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from taxi.drivers.models import DriverProfile

logger = logging.getLogger(__name__)


@receiver(post_save, sender=DriverProfile)
def trigger_qr_generation_on_approval(sender, instance, created, **kwargs):
    """
    Signal handler that triggers QR code generation when a DriverProfile
    status changes to "approved".

    Validates:
    - Status is "approved" (Requirement 2.2: only approved drivers receive QR)
    - driver_code is present (Requirement 1.7: reject if missing)
    - QR code doesn't already exist (Requirement 1.4: preserve existing QR)

    On validation failure for missing driver_code, reverts status and raises
    a ValueError to reject the approval transition.
    """
    # Only proceed if the status is "approved"
    if instance.status != "approved":
        return

    # Skip if QR code already exists (Requirement 1.4)
    if instance.qr_code_uuid:
        logger.info(
            "trigger_qr_generation_on_approval: DriverProfile id=%s already has a "
            "QR code (%s). Skipping generation.",
            instance.pk,
            instance.qr_code_uuid,
        )
        return

    # Validate that driver_code is present (Requirement 1.7)
    if not instance.driver_code:
        logger.error(
            "trigger_qr_generation_on_approval: DriverProfile id=%s has no driver_code. "
            "Rejecting approval.",
            instance.pk,
        )
        # Revert the status change
        DriverProfile.objects.filter(pk=instance.pk).update(status="pending")
        instance.status = "pending"
        raise ValueError(
            "Driver Code must be assigned before approval."
        )

    # Dispatch the Celery task for async QR generation
    from taxi.drivers.tasks import generate_qr_code_task

    generate_qr_code_task.delay(instance.pk)
    logger.info(
        "trigger_qr_generation_on_approval: Dispatched QR generation task "
        "for DriverProfile id=%s.",
        instance.pk,
    )
