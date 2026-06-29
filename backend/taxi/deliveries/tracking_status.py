"""Customer-facing delivery tracking status helpers."""

from __future__ import annotations

MERCHANT_ORDER_STATUS_MAP = {
    "new_order": "order_confirmed",
    "accepted": "merchant_accepted",
    "preparing": "preparing",
    "ready_for_pickup": "ready_for_pickup",
}

DELIVERY_STATUS_MAP = {
    "requested": "finding_courier",
    "accepted": "courier_assigned",
    "courier_arriving": "courier_going_to_pickup",
    "picked_up": "picked_up",
    "in_transit": "on_the_way",
    "delivering": "on_the_way",
    "delivered": "delivered",
    "cancelled": "cancelled",
}

CUSTOMER_STATUS_LABELS = {
    "order_confirmed": "Order confirmed",
    "merchant_accepted": "Merchant accepted",
    "preparing": "Preparing order",
    "ready_for_pickup": "Ready for pickup",
    "finding_courier": "Finding courier",
    "courier_assigned": "Courier assigned",
    "courier_going_to_pickup": "Courier going to pickup",
    "picked_up": "Picked up",
    "on_the_way": "On the way",
    "arriving_soon": "Arriving soon",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}

ARRIVING_SOON_ETA_MINUTES = 3


def get_customer_display_status(delivery, merchant_order=None, eta_minutes=None) -> str:
    """Resolve a single customer-facing tracking status."""
    if delivery.status == "delivered":
        return "delivered"
    if delivery.status == "cancelled":
        return "cancelled"

    if merchant_order and merchant_order.status in MERCHANT_ORDER_STATUS_MAP:
        if delivery.status == "requested" and not delivery.driver_id:
            return MERCHANT_ORDER_STATUS_MAP[merchant_order.status]

    mapped = DELIVERY_STATUS_MAP.get(delivery.status, "finding_courier")
    if mapped in {"on_the_way", "picked_up"} and (
        getattr(delivery, "near_dropoff_notified", False)
        or (eta_minutes is not None and eta_minutes <= ARRIVING_SOON_ETA_MINUTES)
    ):
        return "arriving_soon"
    return mapped


def get_merchant_progress(merchant_order) -> list[dict]:
    if not merchant_order:
        return []
    status = merchant_order.status
    steps = [
        ("order_received", "Order received", status in {
            "new_order", "accepted", "preparing", "ready_for_pickup", "picked_up", "delivered"
        }),
        ("preparing", "Preparing", status in {
            "preparing", "ready_for_pickup", "picked_up", "delivered"
        }),
        ("ready_for_pickup", "Ready for pickup", status in {
            "ready_for_pickup", "picked_up", "delivered"
        }),
    ]
    active_key = {
        "new_order": "order_received",
        "accepted": "order_received",
        "preparing": "preparing",
        "ready_for_pickup": "ready_for_pickup",
        "picked_up": "ready_for_pickup",
        "delivered": "ready_for_pickup",
    }.get(status, "order_received")

    return [
        {
            "key": key,
            "label": label,
            "complete": complete,
            "active": key == active_key and status not in {"picked_up", "delivered"},
        }
        for key, label, complete in steps
    ]


def get_delivery_duration_minutes(delivery) -> int | None:
    if not delivery.accepted_at or not delivery.delivered_at:
        return None
    delta = delivery.delivered_at - delivery.accepted_at
    return max(1, int(delta.total_seconds() // 60))
