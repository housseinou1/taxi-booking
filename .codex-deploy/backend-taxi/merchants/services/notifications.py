"""Real-time merchant notifications."""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


async def send_merchant_event(channel_layer, merchant_user_id, message):
    group = f"merchant_{merchant_user_id}"
    await channel_layer.group_send(
        group,
        {"type": "merchant_event", "message": message},
    )


def notify_merchant_new_order(order):
    channel_layer = get_channel_layer()
    payload = {
        "type": "merchant_new_order",
        "order_id": order.id,
        "total": str(order.total),
        "customer_name": order.recipient_name,
        "status": order.status,
    }
    if channel_layer:
        try:
            async_to_sync(send_merchant_event)(
                channel_layer, order.merchant.owner_id, payload
            )
        except Exception:
            logger.exception("Failed to WS notify merchant %s", order.merchant_id)

    try:
        from notifications.push import notify_merchant_order_event

        notify_merchant_order_event(order.merchant.owner_id, order, "new_order")
    except Exception:
        logger.exception("Failed push notify merchant %s", order.merchant_id)


def notify_merchant_order_update(order, event_type):
    channel_layer = get_channel_layer()
    payload = {
        "type": f"merchant_{event_type}",
        "order_id": order.id,
        "status": order.status,
    }
    if channel_layer:
        try:
            async_to_sync(send_merchant_event)(
                channel_layer, order.merchant.owner_id, payload
            )
        except Exception:
            logger.exception("Failed WS merchant update %s", order.merchant_id)

    try:
        from notifications.push import notify_merchant_order_event

        notify_merchant_order_event(order.merchant.owner_id, order, event_type)
    except Exception:
        pass
