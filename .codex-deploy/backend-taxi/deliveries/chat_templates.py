"""Predefined delivery chat templates (no free-text in Phase 2)."""

DELIVERY_CHAT_TEMPLATES = [
    {"key": "on_my_way", "text": "I'm on my way", "roles": ["courier"]},
    {"key": "arrived_pickup", "text": "I've arrived at the pickup location", "roles": ["courier"]},
    {"key": "arrived_dropoff", "text": "I've arrived at the drop-off location", "roles": ["courier"]},
    {"key": "cant_find_address", "text": "I can't find the address — can you help?", "roles": ["courier"]},
    {"key": "running_late", "text": "Running a few minutes late", "roles": ["courier"]},
    {"key": "please_wait", "text": "Please wait, I'm almost there", "roles": ["courier"]},
    {"key": "package_picked_up", "text": "Package picked up — heading to you now", "roles": ["courier"]},
    {"key": "im_here", "text": "I'm here at the pickup point", "roles": ["customer"]},
    {"key": "coming_down", "text": "Coming down now", "roles": ["customer"]},
    {"key": "wrong_pin", "text": "The PIN didn't work — please check and resend", "roles": ["customer"]},
    {"key": "thanks", "text": "Thank you!", "roles": ["customer", "courier"]},
]


def templates_for_role(role: str):
    role = (role or "").lower()
    if role not in {"customer", "courier"}:
        return []
    return [item for item in DELIVERY_CHAT_TEMPLATES if role in item["roles"]]


def resolve_template(template_key: str, role: str):
    for item in DELIVERY_CHAT_TEMPLATES:
        if item["key"] == template_key and role in item["roles"]:
            return item
    return None
