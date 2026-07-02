"""Yala Delivery service categories."""

from decimal import Decimal

SERVICE_CATEGORIES = [
    {
        "key": "food",
        "label": "Food",
        "icon": "🍔",
        "base_fee": Decimal("40"),
        "description": "Restaurant meals and hot food delivery.",
    },
    {
        "key": "pharmacy",
        "label": "Pharmacy / Medicine",
        "icon": "💊",
        "base_fee": Decimal("50"),
        "description": "Medicines and pharmacy items with careful handling.",
    },
    {
        "key": "grocery",
        "label": "Grocery",
        "icon": "🛒",
        "base_fee": Decimal("60"),
        "description": "Groceries from stores and supermarkets.",
    },
    {
        "key": "package",
        "label": "Parcel",
        "icon": "📦",
        "base_fee": Decimal("70"),
        "description": "Boxes, parcels, and packaged goods.",
    },
    {
        "key": "documents",
        "label": "Documents",
        "icon": "📄",
        "base_fee": Decimal("35"),
        "description": "Envelopes, papers, and secure document runs.",
    },
    {
        "key": "shopping",
        "label": "Shopping",
        "icon": "🛍️",
        "base_fee": Decimal("65"),
        "description": "Personal shopping and retail pickups.",
    },
    {
        "key": "restaurant",
        "label": "Restaurant Orders",
        "icon": "🍽️",
        "base_fee": Decimal("80"),
        "description": "Pre-placed restaurant orders ready for pickup.",
    },
    {
        "key": "market",
        "label": "Market Delivery",
        "icon": "🏪",
        "base_fee": Decimal("60"),
        "description": "Fresh market and local shop items.",
    },
    {
        "key": "household",
        "label": "Water / Household",
        "icon": "💧",
        "base_fee": Decimal("70"),
        "description": "Water bottles and household essentials.",
    },
    {
        "key": "business",
        "label": "Business Delivery",
        "icon": "🏢",
        "base_fee": Decimal("75"),
        "description": "Office supplies and business parcels.",
    },
    {
        "key": "courier",
        "label": "Courier",
        "icon": "🚴",
        "base_fee": Decimal("55"),
        "description": "Legacy general courier runs.",
    },
]

SERVICE_CATEGORY_KEYS = [item["key"] for item in SERVICE_CATEGORIES]

LEGACY_CATEGORY_ALIASES = {
    "document": "documents",
    "parcel": "package",
}


def normalize_service_category(value: str) -> str:
    normalized = (value or "package").strip().lower()
    return LEGACY_CATEGORY_ALIASES.get(normalized, normalized)
