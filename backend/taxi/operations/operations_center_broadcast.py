"""Push real-time operations center updates over Channels."""

from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

OPERATIONS_CENTER_GROUP = "operations_center"
ADMIN_SAFETY_GROUP = "admin_safety"


def broadcast_operations_update(payload: dict) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            OPERATIONS_CENTER_GROUP,
            {
                "type": "operations_update",
                "payload": payload,
            },
        )
    except Exception:
        logger.exception("Failed to broadcast operations center update")


def broadcast_safety_alert(payload: dict) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            ADMIN_SAFETY_GROUP,
            {
                "type": "safety_alert",
                "payload": payload,
            },
        )
        async_to_sync(channel_layer.group_send)(
            OPERATIONS_CENTER_GROUP,
            {
                "type": "safety_alert",
                "payload": payload,
            },
        )
    except Exception:
        logger.exception("Failed to broadcast safety alert to operations center")
