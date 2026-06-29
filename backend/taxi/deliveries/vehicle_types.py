"""Delivery courier vehicle types."""

DELIVERY_VEHICLE_CHOICES = [
    ("bicycle", "Bicycle"),
    ("motorcycle", "Motorcycle"),
    ("car", "Vehicle / Car"),
]

DELIVERY_VEHICLE_LABELS = {
    "bicycle": "Bicycle",
    "motorcycle": "Motorcycle",
    "car": "Vehicle / Car",
}

DELIVERY_VEHICLE_ICONS = {
    "bicycle": "🚲",
    "motorcycle": "🏍️",
    "car": "🚗",
}

PACKAGE_SIZE_RANK = {
    "document": 1,
    "small": 2,
    "medium": 3,
    "large": 4,
}

VEHICLE_MAX_PACKAGE_RANK = {
    "bicycle": 2,
    "motorcycle": 3,
    "car": 4,
}

VEHICLE_DEFAULT_MAX_PACKAGE_SIZE = {
    "bicycle": "small",
    "motorcycle": "medium",
    "car": "large",
}


VALID_DELIVERY_VEHICLE_TYPES = {choice[0] for choice in DELIVERY_VEHICLE_CHOICES}


def normalize_delivery_vehicle_type(value: str, default: str = "motorcycle") -> str:
    normalized = (value or default).lower()
    if normalized in VALID_DELIVERY_VEHICLE_TYPES:
        return normalized
    return default


def get_delivery_vehicle_label(value: str) -> str:
    return DELIVERY_VEHICLE_LABELS.get(normalize_delivery_vehicle_type(value), "Motorcycle")


def courier_can_carry_package(vehicle_type: str, package_type: str) -> bool:
    vehicle_rank = VEHICLE_MAX_PACKAGE_RANK.get((vehicle_type or "motorcycle").lower(), 3)
    package_rank = PACKAGE_SIZE_RANK.get((package_type or "small").lower(), 2)
    return package_rank <= vehicle_rank
