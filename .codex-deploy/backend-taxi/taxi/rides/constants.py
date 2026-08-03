"""Centralized ride distance validation constants."""
from decimal import Decimal

MIN_RIDE_DISTANCE_KM = Decimal("0.1")
MAX_RIDE_DISTANCE_KM = Decimal("500")

DISTANCE_ERROR_MSG = f"Ride distance must be between {MIN_RIDE_DISTANCE_KM} and {MAX_RIDE_DISTANCE_KM} km."
