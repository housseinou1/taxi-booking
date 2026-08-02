"""Waiting fee calculation, snapshot-aware.

Resolution order for a ride's waiting policy:
  1. The ride's persisted pricing snapshot (waiting_policy FK).
  2. The active database WaitingFeeConfig.
  3. market.py fallback.
"""
import math
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from taxi.market import MARKET


def _get_waiting_policy_for_ride(ride=None):
    """Return the waiting policy dict applicable to a ride.

    Prefers the snapshot, falls back to live DB then market.py.
    """
    if ride is not None:
        snapshot = getattr(ride, "pricing_snapshot", None)
        if snapshot and snapshot.waiting_policy:
            cfg = snapshot.waiting_policy
            return {
                "free_minutes": int(cfg.free_minutes),
                "per_minute_fee": Decimal(cfg.per_minute_fee),
                "max_wait_minutes": int(cfg.max_wait_minutes),
                "arrive_max_distance_m": int(cfg.arrive_max_distance_m),
                "no_show_max_distance_m": int(cfg.no_show_max_distance_m),
            }

    # Fall through to live DB / market.py
    from app_settings.pricing_service import get_waiting_policy
    return get_waiting_policy()


def calculate_waiting_fee(waited_seconds, ride=None):
    """Return the waiting fee for the given wait duration.

    Args:
        waited_seconds: Total seconds the driver has been waiting.
        ride: Optional Ride instance.  When provided, the saved waiting policy
              on the ride's pricing snapshot is used (preferred).  Legacy rides
              without a snapshot fall back to the active DB policy then market.py.
    """
    policy = _get_waiting_policy_for_ride(ride)
    free_seconds = int(policy["free_minutes"]) * 60
    per_minute_fee = Decimal(str(policy["per_minute_fee"]))

    if waited_seconds <= free_seconds:
        return Decimal("0.00")

    chargeable_seconds = waited_seconds - free_seconds
    chargeable_minutes = math.ceil(chargeable_seconds / 60)
    fee = Decimal(chargeable_minutes) * per_minute_fee
    return fee.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_waiting_status(ride, at=None):
    """Return a dict describing the current waiting state for a ride.

    Uses the ride's snapshot policy when available.
    """
    policy = _get_waiting_policy_for_ride(ride)
    free_minutes = int(policy["free_minutes"])
    free_seconds = free_minutes * 60
    per_minute_fee = Decimal(str(policy["per_minute_fee"]))

    active = ride.status == "driver_arrived" and bool(ride.driver_arrived_at)
    if not ride.driver_arrived_at:
        return {
            "active": False,
            "driver_arrived_at": None,
            "waited_seconds": 0,
            "free_minutes": free_minutes,
            "free_seconds_remaining": free_seconds,
            "billing_started": False,
            "chargeable_minutes": 0,
            "per_minute_fee": str(per_minute_fee),
            "estimated_fee": "0.00",
            "applied_fee": str(ride.waiting_fee or Decimal("0.00")),
            "currency": MARKET["currency"],
        }

    reference_time = at or timezone.now()
    waited_seconds = max(
        0,
        int((reference_time - ride.driver_arrived_at).total_seconds()),
    )
    billing_started = waited_seconds > free_seconds
    free_seconds_remaining = max(0, free_seconds - waited_seconds)
    chargeable_seconds = max(0, waited_seconds - free_seconds) if billing_started else 0
    chargeable_minutes = math.ceil(chargeable_seconds / 60) if billing_started else 0
    estimated_fee = calculate_waiting_fee(waited_seconds, ride=ride)

    return {
        "active": active,
        "driver_arrived_at": ride.driver_arrived_at.isoformat(),
        "waited_seconds": waited_seconds,
        "free_minutes": free_minutes,
        "free_seconds_remaining": free_seconds_remaining,
        "billing_started": billing_started,
        "chargeable_minutes": chargeable_minutes,
        "per_minute_fee": str(per_minute_fee),
        "estimated_fee": str(estimated_fee),
        "applied_fee": str(ride.waiting_fee or Decimal("0.00")),
        "currency": MARKET["currency"],
    }
