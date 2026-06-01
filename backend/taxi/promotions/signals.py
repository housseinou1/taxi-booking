import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_referral_code_for_new_rider(sender, instance, created, **kwargs):
    """
    Auto-generate a referral code when a new rider account is created.

    Only triggers for:
    - Newly created users (not on every save)
    - Users with user_type="rider" (not admins or drivers)

    Idempotent: if the rider already has a referral code, this is a no-op.
    """
    if not created:
        return

    if getattr(instance, "user_type", None) != "rider":
        return

    # Check if the rider already has a referral code (idempotent)
    from promotions.models import ReferralCode

    if ReferralCode.objects.filter(rider=instance).exists():
        return

    # Generate the referral code
    from promotions.services import PromoCodeService

    try:
        service = PromoCodeService()
        code = service.generate_referral_code(instance)
        logger.info(
            "Generated referral code %s for new rider %s", code, instance.email
        )
    except Exception:
        logger.exception(
            "Failed to generate referral code for new rider %s", instance.email
        )
