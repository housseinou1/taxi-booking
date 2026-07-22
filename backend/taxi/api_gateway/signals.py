"""Phase 38 — Domain event hooks for partner webhook emission."""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .events import emit_partner_webhook


def _ride_payload(ride):
    return {
        "ride_id": ride.id,
        "status": ride.status,
        "rider_id": ride.rider_id,
        "driver_id": ride.driver_id,
        "pickup": ride.pickup,
        "destination": ride.destination,
    }


@receiver(pre_save, sender="rides.Ride")
def cache_ride_status(sender, instance, **kwargs):
    if instance.pk:
        from taxi.rides.models import Ride

        try:
            instance._gateway_previous_status = Ride.objects.get(pk=instance.pk).status
        except Ride.DoesNotExist:
            instance._gateway_previous_status = None
    else:
        instance._gateway_previous_status = None


@receiver(post_save, sender="rides.Ride")
def ride_partner_webhooks(sender, instance, created, **kwargs):
    if created:
        return
    previous = getattr(instance, "_gateway_previous_status", None)
    if previous == instance.status:
        return
    if instance.status == "completed":
        emit_partner_webhook("ride.completed", _ride_payload(instance))
    elif (
        instance.driver_id
        and previous in {"requested", "scheduled", None}
        and instance.status in {"driver_arriving", "driver_arrived", "in_progress"}
    ):
        emit_partner_webhook("ride.accepted", _ride_payload(instance))


@receiver(post_save, sender="deliveries.Delivery")
def delivery_partner_webhooks(sender, instance, created, **kwargs):
    if not created:
        return
    emit_partner_webhook(
        "order.created",
        {
            "delivery_id": instance.id,
            "status": instance.status,
            "customer_id": instance.customer_id,
            "driver_id": instance.driver_id,
        },
    )
    if instance.status == "delivered":
        emit_partner_webhook(
            "order.delivered",
            {
                "delivery_id": instance.id,
                "status": instance.status,
                "customer_id": instance.customer_id,
                "driver_id": instance.driver_id,
            },
        )


@receiver(post_save, sender="merchants.MerchantOrder")
def merchant_order_partner_webhooks(sender, instance, created, **kwargs):
    if created:
        emit_partner_webhook(
            "order.created",
            {
                "order_id": instance.id,
                "merchant_id": instance.merchant_id,
                "status": instance.status,
                "total": str(instance.total),
            },
        )


@receiver(post_save, sender="payments.PaymentRecord")
def payment_partner_webhooks(sender, instance, created, **kwargs):
    if instance.status in {"paid", "authorized"}:
        emit_partner_webhook(
            "payment.received",
            {
                "payment_id": instance.id,
                "amount": str(instance.amount),
                "status": instance.status,
                "ride_id": instance.ride_id,
            },
        )


@receiver(post_save, sender="payments.WithdrawalRequest")
def withdrawal_partner_webhooks(sender, instance, **kwargs):
    if instance.status == "paid":
        emit_partner_webhook(
            "withdrawal.completed",
            {
                "withdrawal_id": instance.id,
                "driver_id": instance.driver_id,
                "amount": str(instance.amount),
                "status": instance.status,
            },
        )


@receiver(post_save, sender="drivers.DriverProfile")
def driver_approved_webhook(sender, instance, **kwargs):
    if instance.status == "approved":
        emit_partner_webhook(
            "driver.approved",
            {
                "driver_id": instance.id,
                "user_id": instance.user_id,
                "status": instance.status,
            },
        )


@receiver(post_save, sender="merchants.Merchant")
def merchant_approved_webhook(sender, instance, **kwargs):
    if instance.status == "approved":
        emit_partner_webhook(
            "merchant.approved",
            {
                "merchant_id": instance.id,
                "name": instance.business_name,
                "status": instance.status,
            },
        )
