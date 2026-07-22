"""Loyalty earn hooks (Phase 33)."""

import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="rides.Ride")
def earn_loyalty_on_ride_complete(sender, instance, **kwargs):
    if instance.status != "completed":
        return
    try:
        from loyalty.services.loyalty_service import earn_points, get_earn_rules, is_loyalty_enabled

        if not is_loyalty_enabled():
            return
        earn_points(
            instance.rider,
            get_earn_rules().get("ride", 10),
            "ride",
            reference=f"ride:{instance.id}",
        )
    except Exception:
        logger.exception("Failed to award loyalty points for ride %s", instance.id)


@receiver(post_save, sender="deliveries.Delivery")
def earn_loyalty_on_delivery_complete(sender, instance, **kwargs):
    if instance.status != "delivered":
        return
    try:
        from loyalty.services.loyalty_service import earn_points, get_earn_rules, is_loyalty_enabled

        if not is_loyalty_enabled():
            return
        earn_points(
            instance.customer,
            get_earn_rules().get("delivery", 8),
            "delivery",
            reference=f"delivery:{instance.id}",
        )
    except Exception:
        logger.exception("Failed to award loyalty points for delivery %s", instance.id)


@receiver(post_save, sender="merchants.MerchantOrder")
def earn_loyalty_on_merchant_order(sender, instance, **kwargs):
    if instance.status != "delivered":
        return
    try:
        from loyalty.services.loyalty_service import earn_points, get_earn_rules, is_loyalty_enabled

        if not is_loyalty_enabled():
            return
        earn_points(
            instance.customer,
            get_earn_rules().get("merchant_order", 5),
            "merchant_order",
            reference=f"merchant_order:{instance.id}",
        )
    except Exception:
        logger.exception("Failed to award loyalty points for merchant order %s", instance.id)


@receiver(post_save, sender="referrals.RiderReferral")
def earn_loyalty_on_referral_complete(sender, instance, **kwargs):
    if instance.status != "completed":
        return
    try:
        from loyalty.services.loyalty_service import earn_points, get_earn_rules, is_loyalty_enabled

        if not is_loyalty_enabled():
            return
        referrer = instance.referral_code.rider
        earn_points(
            referrer,
            get_earn_rules().get("referral", 50),
            "referral",
            reference=f"rider_referral:{instance.id}",
            note="Rider referral completed",
        )
    except Exception:
        logger.exception("Failed to award loyalty points for referral %s", instance.id)
