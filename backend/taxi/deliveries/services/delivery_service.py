"""Core delivery service handling creation, assignment, transitions, and broadcasting."""

import secrets
from decimal import Decimal, InvalidOperation

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from ..models import (
    BusinessAccount,
    Delivery,
    DeliveryStop,
    DriverDeliverySettings,
)
from .pricing import DeliveryPricingService


# Valid status transitions
VALID_TRANSITIONS = {
    "requested": ["accepted", "cancelled"],
    "accepted": ["picked_up", "cancelled"],
    "picked_up": ["delivering"],
    "delivering": ["delivered"],
}

ACTIVE_STATUSES = ["requested", "accepted", "picked_up", "delivering"]

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
        """Check whether a status transition is valid."""
        allowed = VALID_TRANSITIONS.get(current_status, [])
        return new_status in allowed

    def generate_recipient_code(self) -> tuple[str, str]:
        """Generate a 4-digit recipient code and its hash.

        Returns:
            Tuple of (plain_code, hashed_code).
        """
        code = f"{secrets.randbelow(10000):04d}"
        return code, make_password(code)

    def verify_recipient_code(self, hashed_code: str, provided_code: str) -> bool:
        """Verify a recipient code against its stored hash."""
        return check_password(str(provided_code).strip(), hashed_code)

    def check_business_daily_limit(self, business_account: BusinessAccount) -> bool:
        """Check if the business account has reached its daily delivery limit."""
        today = timezone.now().date()
        today_count = Delivery.objects.filter(
            business_account=business_account,
            created_at__date=today,
        ).exclude(status="cancelled").count()
        return today_count < business_account.daily_limit

    def is_express_delivery(self, scheduled_pickup_at) -> bool:
        """Determine if a scheduled delivery qualifies as express (< 2 hours ahead)."""
        if not scheduled_pickup_at:
            return False
        now = timezone.now()
        diff = scheduled_pickup_at - now
        return diff.total_seconds() < 7200  # 2 hours in seconds

    def create_delivery(self, customer, data: dict) -> tuple[Delivery, dict]:
        """Create a new delivery with optional stops.

        Args:
            customer: The User requesting the delivery.
            data: Validated delivery data dict.

        Returns:
            Tuple of (delivery, metadata) where metadata contains recipient codes.

        Raises:
            DeliveryServiceError: If validation fails.
        """
        # Check for active delivery
        if Delivery.objects.filter(
            customer=customer,
            status__in=ACTIVE_STATUSES,
        ).exists():
            raise DeliveryServiceError(
                "Complete or cancel your active delivery before requesting another.",
                code="active_delivery_exists",
            )

        # Business account validation
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

        # Schedule validation
        is_scheduled = data.get("is_scheduled", False)
        scheduled_pickup_at = data.get("scheduled_pickup_at")
        if is_scheduled and scheduled_pickup_at:
            self._validate_schedule(scheduled_pickup_at)

        # Calculate fare
        stops_data = data.get("stops", [])
        if len(stops_data) > 4:
            raise DeliveryServiceError(
                "Maximum 4 delivery stops allowed.",
                code="max_stops_exceeded",
            )

        stops_count = max(1, len(stops_data)) if stops_data else 1
        express = self.is_express_delivery(scheduled_pickup_at) if is_scheduled else False

        try:
            distance_km = Decimal(str(data.get("distance_km", 0)))
        except (InvalidOperation, TypeError, ValueError):
            distance_km = Decimal("0")

        fare_breakdown = pricing_service.calculate_fare(
            service_category=data.get("service_category", "package"),
            package_type=data.get("package_type", "small"),
            distance_km=distance_km,
            stops_count=stops_count,
            fragile=data.get("is_fragile", False),
            express=express,
            business_account=business_account,
        )

        # Generate recipient code for main delivery
        main_code, main_code_hash = self.generate_recipient_code()

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
                package_description=data.get("package_description", ""),
                distance_km=distance_km,
                status="requested",
                recipient_code_hash=main_code_hash,
                customer_notes=data.get("customer_notes", ""),
                service_category=data.get("service_category", "package"),
                is_fragile=data.get("is_fragile", False),
                weight_kg=data.get("weight_kg"),
                is_scheduled=is_scheduled,
                scheduled_pickup_at=scheduled_pickup_at,
                business_account=business_account,
                restaurant_name=data.get("restaurant_name", ""),
                preparation_time_minutes=data.get("preparation_time_minutes"),
                prescription_reference=data.get("prescription_reference", ""),
                is_temperature_sensitive=data.get("is_temperature_sensitive", False),
                shopping_list=data.get("shopping_list", ""),
                max_budget_mru=data.get("max_budget_mru"),
                # Pricing breakdown
                fare=fare_breakdown.total_fare,
                base_fee=fare_breakdown.base_fee,
                distance_fee=fare_breakdown.distance_fee,
                category_surcharge=fare_breakdown.category_surcharge,
                extra_stop_fee=fare_breakdown.extra_stop_fee,
                express_surcharge=fare_breakdown.express_surcharge,
                fragile_surcharge=fare_breakdown.fragile_surcharge,
                discount_amount=fare_breakdown.discount_amount,
                driver_earning=fare_breakdown.driver_earning,
                platform_commission=fare_breakdown.platform_commission,
            )

            # Create stops
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
            "stop_codes": stop_codes,
            "fare_breakdown": fare_breakdown.as_dict(),
        }
        return delivery, metadata

    def assign_driver(self, delivery: Delivery, driver) -> Delivery:
        """Assign a driver to a delivery.

        Args:
            delivery: The delivery to assign.
            driver: The driver User.

        Raises:
            DeliveryServiceError: If assignment is not possible.
        """
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

        # Check driver has no active delivery
        if Delivery.objects.filter(
            driver=driver,
            status__in=["accepted", "picked_up", "delivering"],
        ).exists():
            raise DeliveryServiceError(
                "Complete your active delivery before accepting another.",
                code="driver_active_delivery",
            )

        delivery.driver = driver
        delivery.status = "accepted"
        delivery.accepted_at = timezone.now()
        delivery.save(update_fields=["driver", "status", "accepted_at"])
        return delivery

    def transition_status(self, delivery: Delivery, new_status: str, **kwargs) -> Delivery:
        """Transition a delivery to a new status.

        Args:
            delivery: The delivery to update.
            new_status: The target status.

        Raises:
            DeliveryServiceError: If transition is invalid.
        """
        if not self.validate_transition(delivery.status, new_status):
            raise DeliveryServiceError(
                f"Cannot transition from '{delivery.status}' to '{new_status}'.",
                code="invalid_transition",
            )

        delivery.status = new_status
        now = timezone.now()

        if new_status == "picked_up":
            delivery.picked_up_at = now
        elif new_status == "delivered":
            delivery.delivered_at = now
            # Update driver stats
            self._update_driver_stats(delivery)

        delivery.save()
        return delivery

    def complete_stop(
        self, delivery: Delivery, stop_id: int, code: str, proof_photo=None
    ) -> tuple[DeliveryStop, bool]:
        """Confirm delivery at a specific stop.

        Args:
            delivery: The parent delivery.
            stop_id: ID of the stop.
            code: Recipient confirmation code.
            proof_photo: Optional proof of delivery photo.

        Returns:
            Tuple of (stop, all_stops_done).

        Raises:
            DeliveryServiceError: If verification fails.
        """
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

        # Check if all stops are delivered
        remaining = delivery.stops.exclude(status="delivered").count()
        all_done = remaining == 0

        return stop, all_done

    def _validate_schedule(self, scheduled_pickup_at):
        """Validate scheduling constraints."""
        now = timezone.now()
        diff = scheduled_pickup_at - now

        if diff.total_seconds() < 1800:  # 30 minutes
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
        """Update driver's delivery stats after completion."""
        if not delivery.driver:
            return
        settings, created = DriverDeliverySettings.objects.get_or_create(
            driver=delivery.driver
        )
        settings.total_deliveries_completed += 1

        # Recalculate average delivery time
        if delivery.accepted_at and delivery.delivered_at:
            duration_minutes = int(
                (delivery.delivered_at - delivery.accepted_at).total_seconds() / 60
            )
            total = settings.total_deliveries_completed
            if total <= 1:
                settings.average_delivery_time_minutes = duration_minutes
            else:
                # Running average
                prev_avg = settings.average_delivery_time_minutes
                settings.average_delivery_time_minutes = int(
                    (prev_avg * (total - 1) + duration_minutes) / total
                )

        settings.save()
