import math
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from app_settings.pricing_service import get_waiting_policy as get_db_waiting_policy


def get_waiting_policy():
    """Return the active waiting-fee policy from the database or market.py fallback."""
    return get_db_waiting_policy()


def _waiting_policy_for_ride(ride=None):
    """Use the ride's snapshot waiting policy when available, otherwise the active policy."""
    if ride is not None:
        snapshot = getattr(ride, "pricing_snapshot", None)
        if snapshot and snapshot.waiting_policy:
            policy = snapshot.waiting_policy
            return {
                "free_minutes": int(policy.free_minutes),
                "per_minute_fee": Decimal(policy.per_minute_fee),
                "max_wait_minutes": int(policy.max_wait_minutes),
                "arrive_max_distance_m": int(policy.arrive_max_distance_m),
                "no_show_max_distance_m": int(policy.no_show_max_distance_m),
            }
    return get_waiting_policy()


def calculate_waiting_fee(waited_seconds, ride=None):
    policy = _waiting_policy_for_ride(ride)
    free_seconds = int(policy["free_minutes"]) * 60
    per_minute_fee = Decimal(str(policy["per_minute_fee"]))

    if waited_seconds <= free_seconds:
        return Decimal("0.00")

    chargeable_seconds = waited_seconds - free_seconds
    chargeable_minutes = math.ceil(chargeable_seconds / 60)
    fee = Decimal(chargeable_minutes) * per_minute_fee
    return fee.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_waiting_status(ride, at=None):
    policy = _waiting_policy_for_ride(ride)
    free_minutes = int(policy["free_minutes"])
    free_seconds = free_minutes * 60
    max_wait_minutes = int(policy.get("max_wait_minutes", free_minutes))
    max_wait_seconds = max_wait_minutes * 60
    per_minute_fee = Decimal(str(policy["per_minute_fee"]))

    active = ride.status == "driver_arrived" and bool(ride.driver_arrived_at)
    if not ride.driver_arrived_at:
        return {
            "active": False,
            "driver_arrived_at": None,
            "waited_seconds": 0,
            "free_minutes": free_minutes,
            "free_seconds_remaining": free_seconds,
            "max_wait_minutes": max_wait_minutes,
            "max_wait_seconds": max_wait_seconds,
            "max_wait_seconds_remaining": max_wait_seconds,
            "no_show_unlocked": False,
            "billing_started": False,
            "chargeable_minutes": 0,
            "per_minute_fee": str(per_minute_fee),
            "estimated_fee": "0.00",
            "applied_fee": str(ride.waiting_fee or Decimal("0.00")),
            "currency": "MRU",
        }

    reference_time = at or timezone.now()
    waited_seconds = max(
        0,
        int((reference_time - ride.driver_arrived_at).total_seconds()),
    )
    billing_started = waited_seconds > free_seconds
    free_seconds_remaining = max(0, free_seconds - waited_seconds)
    max_wait_seconds_remaining = max(0, max_wait_seconds - waited_seconds)
    chargeable_seconds = max(0, waited_seconds - free_seconds) if billing_started else 0
    chargeable_minutes = math.ceil(chargeable_seconds / 60) if billing_started else 0
    estimated_fee = calculate_waiting_fee(waited_seconds)

    return {
        "active": active,
        "driver_arrived_at": ride.driver_arrived_at.isoformat(),
        "waited_seconds": waited_seconds,
        "free_minutes": free_minutes,
        "free_seconds_remaining": free_seconds_remaining,
        "max_wait_minutes": max_wait_minutes,
        "max_wait_seconds": max_wait_seconds,
        "max_wait_seconds_remaining": max_wait_seconds_remaining,
        "no_show_unlocked": waited_seconds >= max_wait_seconds,
        "billing_started": billing_started,
        "chargeable_minutes": chargeable_minutes,
        "per_minute_fee": str(per_minute_fee),
        "estimated_fee": str(estimated_fee),
        "applied_fee": str(ride.waiting_fee or Decimal("0.00")),
        "currency": "MRU",
    }
