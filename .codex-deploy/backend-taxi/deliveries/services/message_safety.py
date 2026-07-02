"""Profanity, rate-limit, and image validation for delivery chat messages."""

import re
from datetime import timedelta

from django.utils import timezone

from ..models import DeliveryMessage

MAX_MESSAGE_LENGTH = 500
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
FLOOD_WINDOW_SECONDS = 60
FLOOD_MAX_MESSAGES = 8
FLOOD_MAX_IMAGES = 5
MAX_IMAGES_PER_DELIVERY = 20

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

PROFANITY_PATTERNS = [
    r"\b(fuck|shit|bitch|asshole|bastard|cunt|dick|piss)\b",
    r"\b(merde|putain|connard|salope)\b",
    r"\b(khara|zamel)\b",
]


class MessageSafetyError(Exception):
    def __init__(self, message, code="message_blocked"):
        self.message = message
        self.code = code
        super().__init__(message)


def contains_profanity(text: str) -> bool:
    lowered = (text or "").lower()
    for pattern in PROFANITY_PATTERNS:
        if re.search(pattern, lowered, re.IGNORECASE):
            return True
    return False


def is_flooding(delivery_id: int, sender_id: int) -> bool:
    since = timezone.now() - timedelta(seconds=FLOOD_WINDOW_SECONDS)
    recent_count = DeliveryMessage.objects.filter(
        delivery_id=delivery_id,
        sender_id=sender_id,
        created_at__gte=since,
    ).count()
    return recent_count >= FLOOD_MAX_MESSAGES


def is_image_flooding(delivery_id: int, sender_id: int) -> bool:
    since = timezone.now() - timedelta(seconds=FLOOD_WINDOW_SECONDS)
    recent_images = DeliveryMessage.objects.filter(
        delivery_id=delivery_id,
        sender_id=sender_id,
        created_at__gte=since,
        image__isnull=False,
    ).count()
    return recent_images >= FLOOD_MAX_IMAGES


def validate_optional_message_text(text: str, delivery_id: int, sender_id: int) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    if len(cleaned) > MAX_MESSAGE_LENGTH:
        raise MessageSafetyError(
            f"Message too long (max {MAX_MESSAGE_LENGTH} characters).",
            code="message_too_long",
        )
    if contains_profanity(cleaned):
        raise MessageSafetyError(
            "Message contains inappropriate language.",
            code="profanity_blocked",
        )
    if is_flooding(delivery_id, sender_id):
        raise MessageSafetyError(
            "You are sending messages too quickly. Please wait a moment.",
            code="rate_limited",
        )
    return cleaned


def validate_message_text(text: str, delivery_id: int, sender_id: int) -> str:
    cleaned = validate_optional_message_text(text, delivery_id, sender_id)
    if not cleaned:
        raise MessageSafetyError("Message cannot be empty.", code="empty_message")
    return cleaned


def validate_chat_image(image_file, delivery_id: int, sender_id: int):
    if not image_file:
        raise MessageSafetyError("Image file is required.", code="missing_image")

    size = getattr(image_file, "size", 0) or 0
    if size > MAX_IMAGE_SIZE_BYTES:
        raise MessageSafetyError(
            "Image is too large (max 5 MB).",
            code="image_too_large",
        )

    content_type = (getattr(image_file, "content_type", "") or "").lower()
    if content_type and content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise MessageSafetyError(
            "Unsupported image type. Use JPG, PNG, or WebP.",
            code="unsupported_image_type",
        )

    name = (getattr(image_file, "name", "") or "").lower()
    if name and not any(name.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS):
        raise MessageSafetyError(
            "Unsupported image type. Use JPG, PNG, or WebP.",
            code="unsupported_image_type",
        )

    if is_image_flooding(delivery_id, sender_id):
        raise MessageSafetyError(
            "You are uploading images too quickly. Please wait a moment.",
            code="image_rate_limited",
        )

    total_images = (
        DeliveryMessage.objects.filter(delivery_id=delivery_id, sender_id=sender_id)
        .exclude(image="")
        .exclude(image__isnull=True)
        .count()
    )
    if total_images >= MAX_IMAGES_PER_DELIVERY:
        raise MessageSafetyError(
            f"Photo limit reached for this delivery (max {MAX_IMAGES_PER_DELIVERY}).",
            code="image_delivery_limit",
        )

    if is_flooding(delivery_id, sender_id):
        raise MessageSafetyError(
            "You are sending messages too quickly. Please wait a moment.",
            code="rate_limited",
        )


def validate_message_payload(text: str, image_file, delivery_id: int, sender_id: int) -> str:
    cleaned = validate_optional_message_text(text, delivery_id, sender_id)
    has_image = bool(image_file)
    if not cleaned and not has_image:
        raise MessageSafetyError(
            "Message must include text or an image.",
            code="empty_message",
        )
    if has_image:
        validate_chat_image(image_file, delivery_id, sender_id)
    return cleaned
