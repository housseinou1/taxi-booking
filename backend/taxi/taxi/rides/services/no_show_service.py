"""Driver no-show cancellation helpers."""

from __future__ import annotations

from django.utils import timezone

from taxi.rides.services.waiting_service import get_waiting_policy

# Reasons that can qualify for fee/points waiver after wait + 2 calls.
NO_SHOW_REASON_KEYS = {
    "rider no-show",
    "rider not answering calls",
    "wrong pickup / cannot locate rider",
    "rider refused to board",
    # legacy / overlapped wording from existing modal
    "rider not available",
    "waited too long",
    "wrong pickup location",
}

MIN_CALL_ATTEMPTS_FOR_WAIVER = 2


def normalize_cancel_reason(reason: str) -> str:
    return " ".join(str(reason or "").strip().lower().split())


def is_no_show_reason(reason: str) -> bool:
    return normalize_cancel_reason(reason) in NO_SHOW_REASON_KEYS


def waited_seconds_after_arrival(ride, at=None) -> int:
    if not getattr(ride, "driver_arrived_at", None):
        return 0
    reference = at or timezone.now()
    return max(0, int((reference - ride.driver_arrived_at).total_seconds()))


def free_wait_seconds() -> int:
    return int(get_waiting_policy()["free_minutes"]) * 60


def no_show_waiver_eligible(ride, reason: str, at=None) -> tuple[bool, dict]:
    """Return (eligible, details) for penalty-free driver no-show cancel."""
    waited = waited_seconds_after_arrival(ride, at=at)
    free_secs = free_wait_seconds()
    calls = int(getattr(ride, "rider_call_attempt_count", 0) or 0)
    details = {
        "is_no_show_reason": is_no_show_reason(reason),
        "status_ok": ride.status == "driver_arrived",
        "waited_seconds": waited,
        "free_wait_seconds": free_secs,
        "wait_ok": waited >= free_secs,
        "call_attempts": calls,
        "calls_ok": calls >= MIN_CALL_ATTEMPTS_FOR_WAIVER,
    }
    eligible = (
        details["is_no_show_reason"]
        and details["status_ok"]
        and details["wait_ok"]
        and details["calls_ok"]
    )
    details["eligible"] = eligible
    return eligible, details
