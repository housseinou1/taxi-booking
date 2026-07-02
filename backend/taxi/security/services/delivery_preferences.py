"""Persist saved delivery addresses and reusable instruction defaults."""

from deliveries.instruction_utils import normalize_instructions
from security.models import CustomerDeliveryDefaults, CustomerSavedAddress


def persist_delivery_preferences(
    user,
    data,
    delivery_address,
    dropoff_instructions,
    recipient_alt_phone="",
):
    instructions = normalize_instructions(dropoff_instructions)
    alt_phone = (recipient_alt_phone or "").strip()

    if data.get("save_address") and delivery_address:
        label = (data.get("address_label") or "Home").strip() or "Home"
        existing = CustomerSavedAddress.objects.filter(user=user, address=delivery_address).first()
        address = existing or CustomerSavedAddress(user=user, address=delivery_address)
        address.label = label
        address.building_description = instructions["building_description"]
        address.apartment_floor = instructions["apartment_floor"]
        address.landmark = instructions["landmark"]
        address.gate_color = instructions["gate_color"]
        address.extra_instructions = instructions["extra_instructions"]
        address.recipient_alt_phone = alt_phone
        address.is_default = True
        address.save()
        CustomerSavedAddress.objects.filter(user=user).exclude(id=address.id).update(is_default=False)

    if data.get("save_instructions"):
        defaults, _ = CustomerDeliveryDefaults.objects.get_or_create(user=user)
        defaults.building_description = instructions["building_description"]
        defaults.apartment_floor = instructions["apartment_floor"]
        defaults.landmark = instructions["landmark"]
        defaults.gate_color = instructions["gate_color"]
        defaults.extra_instructions = instructions["extra_instructions"]
        defaults.recipient_alt_phone = alt_phone
        defaults.save()
