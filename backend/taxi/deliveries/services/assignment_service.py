"""Sequential courier assignment: nearest-first offers with decline/timeout reassign."""

import logging
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from ..geo import haversine_km
from ..models import Delivery, DriverDeliverySettings
from ..notifications import _courier_accepts_delivery, _delivery_offer_payload
from ..websocket import send_delivery_new_request

logger = logging.getLogger(__name__)
User = get_user_model()

DEFAULT_OFFER_SECONDS = 30
FOOD_OFFER_SECONDS = 20
URGENT_PHARMACY_OFFER_SECONDS = 15

PICKUP_VERIFY_CATEGORIES = {"package", "documents", "shopping", "pharmacy"}


@dataclass
class RankedCourier:
    driver_id: int
    distance_km: float
    rating: float


class DeliveryAssignmentService:
    """Offer deliveries to couriers one at a time, nearest first."""

    def get_offer_timeout_seconds(self, delivery: Delivery) -> int:
        category = (delivery.service_category or "package").lower()
        if delivery.is_urgent and category == "pharmacy":
            return URGENT_PHARMACY_OFFER_SECONDS
        if category in ("food", "restaurant"):
            return FOOD_OFFER_SECONDS
        return DEFAULT_OFFER_SECONDS

    def rank_eligible_couriers(self, delivery: Delivery) -> list[RankedCourier]:
        from ..notifications import get_eligible_courier_user_ids

        eligible_ids = set(get_eligible_courier_user_ids(delivery))
        if not eligible_ids:
            return []

        declined = set(delivery.declined_driver_ids or [])
        settings_qs = (
            DriverDeliverySettings.objects.filter(driver_id__in=eligible_ids)
            .select_related("driver", "driver__driver_profile")
        )

        ranked: list[RankedCourier] = []
        for settings_obj in settings_qs:
            driver_id = settings_obj.driver_id
            if driver_id in declined:
                continue
            profile = getattr(settings_obj.driver, "driver_profile", None)
            if profile and profile.current_lat is not None and profile.current_lng is not None:
                distance = haversine_km(
                    profile.current_lat,
                    profile.current_lng,
                    delivery.pickup_lat,
                    delivery.pickup_lng,
                )
            else:
                distance = 999.0

            rating = float(settings_obj.delivery_rating or 5.0)
            category = (delivery.service_category or "package").lower()
            if category in ("food", "restaurant"):
                distance *= 0.85
            elif category == "pharmacy" and delivery.is_urgent:
                distance *= 0.75

            ranked.append(RankedCourier(driver_id=driver_id, distance_km=distance, rating=rating))

        ranked.sort(key=lambda item: (item.distance_km, -item.rating))
        return ranked

    def process_expired_offer(self, delivery: Delivery) -> Delivery:
        """Reassign if the current offer has timed out."""
        if delivery.status != "requested" or delivery.driver_id:
            return delivery
        if not delivery.offered_driver_id or not delivery.offer_sent_at:
            return delivery

        timeout = self.get_offer_timeout_seconds(delivery)
        if timezone.now() <= delivery.offer_sent_at + timezone.timedelta(seconds=timeout):
            return delivery

        return self._advance_offer(delivery, penalize_current=False)

    @transaction.atomic
    def start_assignment(self, delivery: Delivery) -> int:
        """Begin sequential offers after order creation."""
        delivery = Delivery.objects.select_for_update().get(pk=delivery.pk)
        if delivery.status != "requested" or delivery.driver_id:
            return 0
        return self._offer_to_next(delivery)

    @transaction.atomic
    def decline_offer(self, delivery: Delivery, driver) -> Delivery:
        delivery = Delivery.objects.select_for_update().get(pk=delivery.pk)
        if delivery.status != "requested" or delivery.driver_id:
            return delivery
        if delivery.offered_driver_id and delivery.offered_driver_id != driver.id:
            raise ValueError("This delivery is not currently offered to you.")

        return self._advance_offer(delivery, penalize_current=True)

    def can_driver_accept(self, delivery: Delivery, driver) -> bool:
        if delivery.status != "requested" or delivery.driver_id:
            return False
        if delivery.offered_driver_id and delivery.offered_driver_id != driver.id:
            return False
        settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=driver)
        return _courier_accepts_delivery(settings_obj, delivery)

    @transaction.atomic
    def _advance_offer(self, delivery: Delivery, penalize_current: bool) -> Delivery:
        declined = list(delivery.declined_driver_ids or [])
        if penalize_current and delivery.offered_driver_id:
            if delivery.offered_driver_id not in declined:
                declined.append(delivery.offered_driver_id)

        delivery.declined_driver_ids = declined
        delivery.offered_driver = None
        delivery.offer_sent_at = None
        delivery.assignment_round = (delivery.assignment_round or 0) + 1
        delivery.save(
            update_fields=[
                "declined_driver_ids",
                "offered_driver",
                "offer_sent_at",
                "assignment_round",
            ]
        )
        self._offer_to_next(delivery)
        return delivery

    def _offer_to_next(self, delivery: Delivery) -> int:
        ranked = self.rank_eligible_couriers(delivery)
        if not ranked:
            return 0

        next_courier = ranked[0]
        delivery.offered_driver_id = next_courier.driver_id
        delivery.offer_sent_at = timezone.now()
        delivery.save(update_fields=["offered_driver", "offer_sent_at"])

        payload = _delivery_offer_payload(delivery)
        payload["estimated_duration_minutes"] = delivery.estimated_duration_minutes
        payload["offer_expires_in"] = self.get_offer_timeout_seconds(delivery)
        payload["is_priority"] = (delivery.service_category or "").lower() in (
            "food",
            "restaurant",
            "pharmacy",
        )

        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer:
            try:
                async_to_sync(send_delivery_new_request)(
                    channel_layer,
                    [next_courier.driver_id],
                    payload,
                )
            except Exception:
                logger.exception("Failed to send delivery offer to driver %s", next_courier.driver_id)

        from notifications.push import notify_new_delivery_request

        try:
            notify_new_delivery_request(next_courier.driver_id, delivery)
        except Exception:
            logger.exception("Failed to push delivery offer to driver %s", next_courier.driver_id)

        return 1


assignment_service = DeliveryAssignmentService()
