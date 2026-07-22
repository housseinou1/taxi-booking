"""Phase 39 — Celery tasks for YALA Academy."""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="academy.tasks.expire_academy_certificates")
def expire_academy_certificates():
    """Mark expired certificates and notify users approaching renewal."""
    from .academy_service import expire_certificates

    try:
        count = expire_certificates()
        logger.info("Expired %s academy certificates", count)
        return count
    except Exception:
        logger.exception("Academy certificate expiry task failed")
        raise
