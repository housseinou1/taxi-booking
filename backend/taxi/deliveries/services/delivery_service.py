"""Core delivery service handling creation, assignment, transitions, and broadcasting."""

import secrets
from decimal import Decimal, InvalidOperation

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from ..categories import normalize_service_category
from ..cities import (
    DEFAULT_DELIVERY_CITY,
    courier_serves_city,
    normalize_city_name,
)
from ..courier_routing import (
    courier_matches_required,
    normalize_courier_type_required,
)
from ..geo import estimate_delivery_duration_minutes
from ..instruction_utils import normalize_instructions
from ..models import (
    BusinessAccount,
    Delivery,
    DeliveryStop,
    DriverDeliverySettings,
)
from .pricing import DeliveryPricingService

VALID_TRANSITIONS = {
    "requested": ["accepted", "cancelled"],
    "accepted": ["courier_arriving", "picked_up", "cancelled"],
    "courier_arriving": ["picked_up", "cancelled"],
    "picked_up": ["in_transit", "delivering"],
    "in_transit": ["delivered", "delivery_exception"],
    "delivering": ["delivered", "delivery_exception"],
    "delivery_exception": ["delivered", "cancelled"],
}

ACTIVE_STATUSES = [
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
]

PICKUP_VERIFY_CATEGORIES = {"package", "documents", "shopping", "pharmacy", "food", "grocery", "restaurant", "market", "household", "business", "courier"}
PROOF_REQUIRED_CATEGORIES = {"package", "documents"}

pricing_service = DeliveryPricingService()


class DeliveryServiceError(Exception):
    """Raised when a delivery operation fails validation."""

    def __init__(self, message, code="delivery_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class DeliveryService:
    """Manages delivery lifecycle: creation, assignment, status transitions."""

    def validate_transition(self, current_status: str, new_status: str) -> bool:
        allowed = VALID_TRANSITIONS.get(current_status, [])
        return new_status in allowed

    def generate_recipient_code(self) -> tuple[str, str]:
        code = f"{secrets.randbelow(10000):04d}"
        return code, make_password(code)

    def verify_recipient_code(self, hashed_code: str, provided_code: str) -> bool:
        return check_password(str(provided_code).strip(), hashed_code)

    def requires_pickup_verification(self, delivery: Delivery) -> bool:
        category = (delivery.service_category or "package").lower()
        return category in PICKUP_VERIFY_CATEGORIES

    def requires_proof_photo(self, delivery: Delivery) -> bool:
        category = (delivery.service_category or "package").lower()
        return category in PROOF_REQUIRED_CATEGORIES or delivery.is_secure_delivery

    def verify_pickup(
        self,
        delivery: Delivery,
        pickup_pin: str = "",
        pickup_confirmed: bool = False,
        *,
        actor=None,
    ) -> None:
        from security.services.fraud_service import log_verification_event
        from taxi.security.abuse import pin_lockout_retry, record_pin_failure

        if not self.requires_pickup_verification(delivery):
            return
        if pickup_confirmed:
            delivery.pickup_pin_verified_at = timezone.now()
            log_verification_event(
                delivery, "pickup_confirmed", actor=actor, success=True
            )
            return
        pin_identity = f"delivery:{delivery.id}:user:{getattr(actor, 'id', 'unknown')}"
        lockout = pin_lockout_retry("delivery-pickup-pin", pin_identity)
        if lockout:
            raise DeliveryServiceError(
                "Too many incorrect PIN attempts. Try again later.",
                code="pin_locked",
            )
        submitted = str(pickup_pin or "").strip()
        if not submitted or not secrets.compare_digest(submitted, delivery.pickup_pin):
            retry = record_pin_failure("delivery-pickup-pin", pin_identity)
            log_verification_event(
                delivery,
                "pickup_pin_fail",
                actor=actor,
                success=False,
                metadata={"attempted": bool(submitted)},
            )
            if retry:
                raise DeliveryServiceError(
                    "Too many incorrect PIN attempts. Try again later.",
                    code="pin_locked",
                )
            raise DeliveryServiceError(
                "Pickup PIN is incorrect.",
                code="invalid_pickup_pin",
            )
        delivery.pickup_pin_verified_at = timezone.now()
        log_verification_event(
            delivery, "pickup_pin_success", actor=actor, success=True
        )

    def check_business_daily_limit(self, business_account: BusinessAccount) -> bool:
        today = timezone.now().date()
        today_count = Delivery.objects.filter(
            business_account=business_account,
            created_at__date=today,
        ).exclude(status="cancelled").count()
        return today_count < business_account.daily_limit

    def is_express_delivery(self, scheduled_pickup_at) -> bool:
        if not scheduled_pickup_at:
            return False
        diff = scheduled_pickup_at - timezone.now()
        return diff.total_seconds() < 7200

    def create_delivery(self, customer, data: dict) -> tuple[Delivery, dict]:
        if Delivery.objects.filter(customer=customer, status__in=ACTIVE_STATUSES).exists():
            raise DeliveryServiceError(
                "Complete or cancel your active delivery before requesting another.",
                code="active_delivery_exists",
            )

        business_account = None
        business_account_id = data.get("business_account_id")
        if business_account_id:
            try:
                business_account = BusinessAccount.objects.get(
                    id=business_account_id, is_active=True
                )
            except BusinessAccount.DoesNotExist:
                raise DeliveryServiceError(
                    "Business account not found or inactive.",
                    code="invalid_business_account",
                )
            if not self.check_business_daily_limit(business_account):
                raise DeliveryServiceError(
                    "Daily delivery limit reached for this business account.",
                    code="daily_limit_reached",
                )

        is_scheduled = data.get("is_scheduled", False)
        scheduled_pickup_at = data.get("scheduled_pickup_at")
        if is_scheduled and scheduled_pickup_at:
            self._validate_schedule(scheduled_pickup_at)

        stops_data = data.get("stops", [])
        if len(stops_data) > 4:
            raise DeliveryServiceError(
                "Maximum 4 delivery stops allowed.",
                code="max_stops_exceeded",
            )

        stops_count = max(1, len(stops_data)) if stops_data else 1
        is_urgent = bool(data.get("is_urgent", False))

        try:
            distance_km = Decimal(str(data.get("distance_km", 0)))
        except (InvalidOperation, TypeError, ValueError):
            distance_km = Decimal("0")

        service_category = normalize_service_category(data.get("service_category", "package"))
        fare_breakdown = pricing_service.calculate_fare(
            service_category=service_category,
            package_type=data.get("package_type", "small"),
            distance_km=distance_km,
            courier_type=data.get("courier_type_required", "motorcycle"),
            stops_count=stops_count,
            fragile=data.get("is_fragile", False),
            urgent=is_urgent,
            weight_kg=data.get("weight_kg"),
            promo_code=data.get("promo_code", ""),
            rider=customer,
            business_account=business_account,
        )

        main_code, main_code_hash = self.generate_recipient_code()
        estimated_duration = estimate_delivery_duration_minutes(float(distance_km), service_category)
        payment_method = data.get("payment_method") or "cash"
        if payment_method not in {"cash", "card", "wallet"}:
            payment_method = "cash"

        with transaction.atomic():
            delivery = Delivery.objects.create(
                customer=customer,
                pickup=data.get("pickup", ""),
                destination=data.get("destination", ""),
                pickup_lat=data.get("pickup_lat", 18.0735),
                pickup_lng=data.get("pickup_lng", -15.9582),
                destination_lat=data.get("destination_lat", 18.0896),
                destination_lng=data.get("destination_lng", -15.9754),
                recipient_name=data.get("recipient_name", ""),
                recipient_phone=data.get("recipient_phone", ""),
                package_type=data.get("package_type", "small"),
                courier_type_required=normalize_courier_type_required(
                    data.get("courier_type_required"),
                    data.get("package_type", "small"),
                ),
                package_description=data.get("package_description", ""),
                distance_km=distance_km,
                status="requested",
                recipient_code_hash=main_code_hash,
                customer_notes=data.get("customer_notes", ""),
                pickup_instructions=normalize_instructions(data.get("pickup_instructions")),
                dropoff_instructions=normalize_instructions(data.get("dropoff_instructions")),
                recipient_alt_phone=(data.get("recipient_alt_phone") or "").strip(),
                service_city=normalize_city_name(data.get("service_city")) or DEFAULT_DELIVERY_CITY,
                service_category=service_category,
                is_fragile=data.get("is_fragile", False),
                weight_kg=data.get("weight_kg"),
                estimated_duration_minutes=estimated_duration,
                payment_method=payment_method,
                payment_status="pending",
                is_scheduled=is_scheduled,
                scheduled_pickup_at=scheduled_pickup_at,
                business_account=business_account,
                restaurant_name=data.get("restaurant_name", ""),
                food_items=data.get("food_items", ""),
                preparation_time_minutes=data.get("preparation_time_minutes"),
                pharmacy_name=data.get("pharmacy_name", ""),
                prescription_reference=data.get("prescription_reference", ""),
                is_urgent=is_urgent,
                is_temperature_sensitive=data.get("is_temperature_sensitive", False),
                store_name=data.get("store_name", ""),
                shopping_list=data.get("shopping_list", ""),
                item_quantity=data.get("item_quantity", ""),
                substitution_notes=data.get("substitution_notes", ""),
                is_secure_delivery=data.get("is_secure_delivery", False),
                max_budget_mru=data.get("max_budget_mru"),
                prescription_photo=data.get("prescription_photo"),
                fare=fare_breakdown.total_fare,
                base_fee=fare_breakdown.base_fee,
                distance_fee=fare_breakdown.distance_fee,
                category_surcharge=fare_breakdown.category_surcharge,
                extra_stop_fee=fare_breakdown.extra_stop_fee,
                express_surcharge=fare_breakdown.urgent_surcharge,
                fragile_surcharge=fare_breakdown.fragile_surcharge,
                package_size_surcharge=fare_breakdown.package_size_fee,
                surge_surcharge=fare_breakdown.surge_surcharge,
                night_surcharge=fare_breakdown.night_surcharge,
                waiting_fee=fare_breakdown.waiting_fee,
                heavy_surcharge=fare_breakdown.heavy_surcharge,
                courier_multiplier=fare_breakdown.courier_multiplier,
                promo_code=fare_breakdown.promo_code,
                pricing_snapshot=fare_breakdown.as_dict(),
                discount_amount=fare_breakdown.discount_amount,
                driver_earning=fare_breakdown.driver_earning,
                platform_commission=fare_breakdown.platform_commission,
            )

            stop_codes = {}
            for idx, stop_data in enumerate(stops_data, start=1):
                code, code_hash = self.generate_recipient_code()
                DeliveryStop.objects.create(
                    delivery=delivery,
                    stop_order=idx,
                    address=stop_data.get("address", ""),
                    latitude=stop_data.get("latitude", 0),
                    longitude=stop_data.get("longitude", 0),
                    recipient_name=stop_data.get("recipient_name", ""),
                    recipient_phone=stop_data.get("recipient_phone", ""),
                    recipient_code_hash=code_hash,
                    package_description=stop_data.get("package_description", ""),
                )
                stop_codes[idx] = code

        metadata = {
            "recipient_code": main_code,
            "pickup_pin": delivery.pickup_pin,
            "dropoff_pin": delivery.dropoff_pin,
            "stop_codes": stop_codes,
            "fare_breakdown": fare_breakdown.as_dict(),
            "estimated_duration_minutes": estimated_duration,
        }
        return delivery, metadata

    def assign_driver(self, delivery: Delivery, driver) -> Delivery:
        if delivery.status != "requested":
            raise DeliveryServiceError(
                "This delivery is no longer available.",
                code="delivery_unavailable",
            )
        if delivery.driver is not None:
            raise DeliveryServiceError(
                "This delivery already has a driver.",
                code="already_assigned",
            )
        if Delivery.objects.filter(
            driver=driver,
            status__in=["accepted", "courier_arriving", "picked_up", "in_transit", "delivering", "delivery_exception"],
        ).exists():
            raise DeliveryServiceError(
                "Complete your active delivery before accepting another.",
                code="driver_active_delivery",
            )

        from ..services.assignment_service import assignment_service

        if not assignment_service.can_driver_accept(delivery, driver):
            raise DeliveryServiceError(
                "This delivery is not currently offered to you.",
                code="offer_not_available",
            )

        settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=driver)
        if not courier_serves_city(settings_obj, delivery.service_city):
            raise DeliveryServiceError(
                "This delivery is outside your selected work cities.",
                code="city_not_served",
            )
        if not courier_matches_required(
            settings_obj.delivery_vehicle_type,
            delivery.courier_type_required,
            delivery.package_type,
        ):
            raise DeliveryServiceError(
                "This delivery requires a different courier vehicle type.",
                code="courier_type_mismatch",
            )

        delivery.driver = driver
        delivery.status = "accepted"
        delivery.accepted_at = timezone.now()
        delivery.offered_driver = None
        delivery.offer_sent_at = None
        delivery.save(
            update_fields=["driver", "status", "accepted_at", "offered_driver", "offer_sent_at"]
        )

        from ..broadcast import broadcast_delivery_assigned, broadcast_delivery_status

        broadcast_delivery_assigned(delivery)
        broadcast_delivery_status(delivery)

        from .notifications import notify_delivery_status_change

        notify_delivery_status_change(delivery, previous_status="requested")

        # Send PIN notifications via SMS
        self._send_pin_notifications(delivery)

        return delivery

    def transition_status(self, delivery: Delivery, new_status: str, **kwargs) -> Delivery:
        if not self.validate_transition(delivery.status, new_status):
            raise DeliveryServiceError(
                f"Cannot transition from '{delivery.status}' to '{new_status}'.",
                code="invalid_transition",
            )

        old_status = delivery.status
        delivery.status = new_status
        now = timezone.now()

        if new_status == "courier_arriving":
            delivery.courier_arriving_at = now
        elif new_status == "picked_up":
            delivery.picked_up_at = now
            self._sync_linked_merchant_order(delivery, new_status)
        elif new_status in {"in_transit", "delivering"}:
            delivery.in_transit_at = now
        elif new_status == "delivered":
            delivery.delivered_at = now
            self._update_driver_stats(delivery)
            self._sync_linked_merchant_order(delivery, new_status)

        delivery.save()

        from ..broadcast import broadcast_delivery_status
        from .notifications import notify_delivery_status_change

        broadcast_delivery_status(delivery)
        notify_delivery_status_change(delivery, previous_status=old_status)
        return delivery

    def complete_stop(
        self, delivery: Delivery, stop_id: int, code: str, proof_photo=None
    ) -> tuple[DeliveryStop, bool]:
        try:
            stop = DeliveryStop.objects.get(id=stop_id, delivery=delivery)
        except DeliveryStop.DoesNotExist:
            raise DeliveryServiceError("Stop not found.", code="stop_not_found")

        if stop.status == "delivered":
            raise DeliveryServiceError(
                "This stop has already been delivered.", code="stop_already_delivered"
            )
        if not self.verify_recipient_code(stop.recipient_code_hash, code):
            raise DeliveryServiceError(
                "Recipient confirmation code is incorrect.", code="invalid_code"
            )

        stop.status = "delivered"
        stop.delivered_at = timezone.now()
        if proof_photo:
            stop.proof_photo = proof_photo
        stop.save()

        remaining = delivery.stops.exclude(status="delivered").count()
        return stop, remaining == 0

    def submit_rating(
        self,
        delivery: Delivery,
        customer,
        rating: int,
        review: str = "",
        merchant_rating=None,
        experience_rating=None,
    ) -> Delivery:
        if delivery.customer_id != customer.id:
            raise DeliveryServiceError("You cannot rate this delivery.", code="forbidden")
        if delivery.status != "delivered":
            raise DeliveryServiceError(
                "Delivery must be completed before rating.",
                code="not_delivered",
            )
        if delivery.customer_rating:
            raise DeliveryServiceError(
                "This delivery has already been rated.",
                code="already_rated",
            )
        if rating < 1 or rating > 5:
            raise DeliveryServiceError("Rating must be between 1 and 5.", code="invalid_rating")

        import json

        review_payload = {"text": (review or "").strip()}
        if merchant_rating is not None:
            try:
                review_payload["merchant_rating"] = int(merchant_rating)
            except (TypeError, ValueError):
                pass
        if experience_rating is not None:
            try:
                review_payload["experience_rating"] = int(experience_rating)
            except (TypeError, ValueError):
                pass

        delivery.customer_rating = rating
        delivery.customer_review = json.dumps(review_payload)
        delivery.rated_at = timezone.now()
        delivery.save(update_fields=["customer_rating", "customer_review", "rated_at"])

        if delivery.driver:
            settings, _ = DriverDeliverySettings.objects.get_or_create(driver=delivery.driver)
            completed = max(settings.total_deliveries_completed, 1)
            previous = float(settings.delivery_rating or 5.0)
            settings.delivery_rating = round(
                ((previous * (completed - 1)) + rating) / completed, 1
            )
            settings.save(update_fields=["delivery_rating"])
        return delivery

    def settle_payment(
        self,
        delivery: Delivery,
        customer,
        payment_method: str,
        tip_amount=0,
        payment_timing: str = "",
    ) -> Delivery:
        if delivery.customer_id != customer.id:
            raise DeliveryServiceError("You cannot pay for this delivery.", code="forbidden")
        if delivery.status != "delivered":
            raise DeliveryServiceError(
                "Delivery must be completed before payment.",
                code="not_delivered",
            )

        method = (payment_method or "cash").lower()
        if method not in {"cash", "card", "wallet", "bankily", "masrvi", "seddad"}:
            raise DeliveryServiceError("Invalid payment method.", code="invalid_payment_method")

        from payments.settlement_service import SettlementError, settle_delivery_payment

        try:
            settle_delivery_payment(
                delivery,
                customer,
                payment_method=method,
                tip_amount=tip_amount,
                payment_timing=payment_timing,
            )
        except SettlementError as exc:
            raise DeliveryServiceError(exc.message, code=exc.code) from exc
        delivery.refresh_from_db()

        if delivery.payment_status == "paid":
            from .notifications import notify_delivery_payment_event

            notify_delivery_payment_event(delivery)

        return delivery

    def _send_pin_notifications(self, delivery: Delivery):
        """Send pickup PIN and dropoff PIN via push notification to the customer."""
        import logging

        logger = logging.getLogger(__name__)

        try:
            from notifications.push import send_push_to_user

            # Push notification to customer with pickup PIN
            send_push_to_user(
                delivery.customer,
                "Pickup PIN Ready",
                f"Your pickup PIN is {delivery.pickup_pin}. "
                f"Give this code to the courier when they collect your package.",
                {
                    "type": "delivery_pickup_pin",
                    "delivery_id": delivery.id,
                    "pickup_pin": delivery.pickup_pin,
                    "deep_link": "/delivery",
                },
                app_type="rider",
                android_channel_id="yala_deliveries",
            )

            # Push notification to customer with dropoff PIN
            send_push_to_user(
                delivery.customer,
                "Delivery PIN for Recipient",
                f"The recipient's delivery PIN is {delivery.dropoff_pin}. "
                f"Share this with {delivery.recipient_name or 'the recipient'} — "
                f"they'll give it to the courier at delivery.",
                {
                    "type": "delivery_dropoff_pin",
                    "delivery_id": delivery.id,
                    "dropoff_pin": delivery.dropoff_pin,
                    "deep_link": "/delivery",
                },
                app_type="rider",
                android_channel_id="yala_deliveries",
            )
        except Exception:
            logger.exception("Failed to send PIN push notifications for delivery %s", delivery.id)

        # Optional: send SMS if provider is configured (skip if not)
        try:
            from django.conf import settings as django_settings

            if getattr(django_settings, "YALA_SMS_PROVIDER", "") and django_settings.YALA_SMS_PROVIDER != "disabled":
                from authapp.phone_views import send_sms

                sender_phone = getattr(delivery.customer, "phone_number", "") or ""
                if sender_phone:
                    try:
                        send_sms(
                            sender_phone,
                            f"Yala Delivery #{delivery.id}: Pickup PIN is {delivery.pickup_pin}. "
                            f"Dropoff PIN for recipient: {delivery.dropoff_pin}.",
                        )
                    except Exception:
                        logger.debug("SMS send skipped/failed for delivery %s", delivery.id)
        except Exception:
            pass

    def verify_dropoff_pin(
        self,
        delivery: Delivery,
        dropoff_pin: str = "",
        *,
        actor=None,
    ) -> None:
        """Verify the 4-digit dropoff PIN provided by the recipient to the courier."""
        from security.services.fraud_service import log_verification_event
        from taxi.security.abuse import pin_lockout_retry, record_pin_failure

        pin_identity = f"delivery:{delivery.id}:user:{getattr(actor, 'id', 'unknown')}"
        lockout = pin_lockout_retry("delivery-dropoff-pin", pin_identity)
        if lockout:
            raise DeliveryServiceError(
                "Too many incorrect PIN attempts. Try again later.",
                code="pin_locked",
            )
        submitted = str(dropoff_pin or "").strip()
        if not submitted or not secrets.compare_digest(submitted, delivery.dropoff_pin):
            retry = record_pin_failure("delivery-dropoff-pin", pin_identity)
            log_verification_event(
                delivery,
                "dropoff_pin_fail",
                actor=actor,
                success=False,
                metadata={"attempted": bool(submitted)},
            )
            if retry:
                raise DeliveryServiceError(
                    "Too many incorrect PIN attempts. Try again later.",
                    code="pin_locked",
                )
            raise DeliveryServiceError(
                "Delivery PIN is incorrect.",
                code="invalid_dropoff_pin",
            )
        delivery.dropoff_pin_verified_at = timezone.now()
        log_verification_event(
            delivery, "dropoff_pin_success", actor=actor, success=True
        )

    def _validate_schedule(self, scheduled_pickup_at):
        now = timezone.now()
        diff = scheduled_pickup_at - now
        if diff.total_seconds() < 1800:
            raise DeliveryServiceError(
                "Scheduled pickup must be at least 30 minutes in the future.",
                code="schedule_too_soon",
            )
        if diff.days > 7:
            raise DeliveryServiceError(
                "Scheduled pickup cannot be more than 7 days ahead.",
                code="schedule_too_far",
            )

    def _update_driver_stats(self, delivery: Delivery):
        if not delivery.driver:
            return
        settings, _ = DriverDeliverySettings.objects.get_or_create(driver=delivery.driver)
        settings.total_deliveries_completed += 1

        if delivery.accepted_at and delivery.delivered_at:
            duration_minutes = int(
                (delivery.delivered_at - delivery.accepted_at).total_seconds() / 60
            )
            total = settings.total_deliveries_completed
            if total <= 1:
                settings.average_delivery_time_minutes = duration_minutes
            else:
                prev_avg = settings.average_delivery_time_minutes
                settings.average_delivery_time_minutes = int(
                    (prev_avg * (total - 1) + duration_minutes) / total
                )
        settings.save()

        from incentives.services.delivery_incentives import track_delivery_completion

        track_delivery_completion(delivery.driver)

    def _sync_linked_merchant_order(self, delivery: Delivery, delivery_status: str):
        order = delivery.merchant_orders.first()
        if not order:
            return
        from merchants.services.order_service import MerchantOrderError, MerchantOrderService

        service = MerchantOrderService()
        try:
            if delivery_status == "picked_up" and order.status == "ready_for_pickup":
                service.mark_picked_up(order)
            elif delivery_status == "delivered" and order.status in {
                "picked_up",
                "ready_for_pickup",
            }:
                service.mark_delivered(order)
        except MerchantOrderError:
            pass


delivery_service = DeliveryService()
