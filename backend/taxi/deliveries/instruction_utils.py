"""Normalize and format structured delivery location instructions."""

INSTRUCTION_KEYS = (
    "building_description",
    "apartment_floor",
    "landmark",
    "gate_color",
    "extra_instructions",
)


def empty_instructions() -> dict:
    return {key: "" for key in INSTRUCTION_KEYS}


def normalize_instructions(value) -> dict:
    if not value:
        return empty_instructions()
    if isinstance(value, str):
        return {**empty_instructions(), "extra_instructions": value.strip()[:1000]}
    if not isinstance(value, dict):
        return empty_instructions()

    limits = {
        "building_description": 200,
        "apartment_floor": 80,
        "landmark": 200,
        "gate_color": 40,
        "extra_instructions": 1000,
    }
    normalized = empty_instructions()
    for key in INSTRUCTION_KEYS:
        raw = value.get(key, "")
        normalized[key] = str(raw or "").strip()[: limits[key]]
    return normalized


def instructions_from_saved_address(address) -> dict:
    if not address:
        return empty_instructions()
    return normalize_instructions(
        {
            "building_description": getattr(address, "building_description", ""),
            "apartment_floor": getattr(address, "apartment_floor", ""),
            "landmark": getattr(address, "landmark", ""),
            "gate_color": getattr(address, "gate_color", ""),
            "extra_instructions": getattr(address, "extra_instructions", ""),
        }
    )


def instructions_summary(instructions: dict) -> list[dict]:
    labels = {
        "building_description": "Building",
        "apartment_floor": "Apt / floor",
        "landmark": "Landmark",
        "gate_color": "Gate color",
        "extra_instructions": "Instructions",
    }
    normalized = normalize_instructions(instructions)
    rows = []
    for key in INSTRUCTION_KEYS:
        value = normalized.get(key, "")
        if value:
            rows.append({"key": key, "label": labels[key], "value": value})
    return rows


def has_instructions(instructions: dict) -> bool:
    return bool(instructions_summary(instructions))
