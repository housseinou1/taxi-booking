"""Courier type routing for package sizes."""

from .vehicle_types import (
    VALID_DELIVERY_VEHICLE_TYPES,
    courier_can_carry_package,
    get_delivery_vehicle_label,
    normalize_delivery_vehicle_type,
)

# Small → bicycle / motorcycle | Medium → motorcycle | Large → vehicle (car)
PACKAGE_COURIER_OPTIONS = {
    "document": ["bicycle", "motorcycle"],
    "small": ["bicycle", "motorcycle"],
    "medium": ["motorcycle"],
    "large": ["car"],
}

COURIER_TYPE_PRICE_MULTIPLIER = {
    "bicycle": 0.85,
    "motorcycle": 1.0,
    "car": 1.25,
}

COURIER_TYPE_ETA_ADJUSTMENT = {
    "bicycle": 8,
    "motorcycle": 0,
    "car": 5,
}


def get_eligible_courier_types(package_type: str) -> list[str]:
    package = (package_type or "small").lower()
    options = PACKAGE_COURIER_OPTIONS.get(package, ["motorcycle"])
    return [item for item in options if item in VALID_DELIVERY_VEHICLE_TYPES]


def get_default_courier_type(package_type: str) -> str:
    options = get_eligible_courier_types(package_type)
    return options[0] if options else "motorcycle"


def normalize_courier_type_required(value: str, package_type: str = "small") -> str:
    normalized = normalize_delivery_vehicle_type(value or get_default_courier_type(package_type))
    allowed = get_eligible_courier_types(package_type)
    if normalized in allowed:
        return normalized
    return get_default_courier_type(package_type)


def courier_matches_required(settings_vehicle_type: str, required_type: str, package_type: str) -> bool:
    """Courier can accept if their vehicle matches required type and can carry package."""
    vehicle = normalize_delivery_vehicle_type(settings_vehicle_type)
    required = normalize_courier_type_required(required_type, package_type)
    if vehicle != required:
        return False
    return courier_can_carry_package(vehicle, package_type)


def get_courier_type_label(courier_type: str) -> str:
    return get_delivery_vehicle_label(courier_type)
