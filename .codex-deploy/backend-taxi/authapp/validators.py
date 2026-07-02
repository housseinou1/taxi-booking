import re

from rest_framework import serializers


FAKE_VALUES = {
    "fake",
    "test",
    "testing",
    "unknown",
    "none",
    "null",
    "n/a",
    "na",
    "asdf",
    "qwerty",
}


def _compact(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def validate_person_name(value, label):
    value = _compact(value)

    if len(value) < 2:
        raise serializers.ValidationError(f"{label} must contain at least 2 characters.")

    if len(value) > 50:
        raise serializers.ValidationError(f"{label} must be 50 characters or fewer.")

    if value.casefold() in FAKE_VALUES or len(set(value.casefold().replace(" ", ""))) == 1:
        raise serializers.ValidationError(f"Enter a real {label.lower()}.")

    name_characters = value.replace(" ", "").replace("-", "").replace("'", "")
    if not name_characters.isalpha():
        raise serializers.ValidationError(
            f"{label} may contain only letters, spaces, apostrophes, and hyphens."
        )

    return value


def normalize_mauritania_phone(value):
    raw_value = _compact(value)
    digits = re.sub(r"\D", "", raw_value)

    if digits.startswith("00222"):
        digits = digits[5:]
    elif digits.startswith("222") and len(digits) == 11:
        digits = digits[3:]

    if len(digits) != 8:
        raise serializers.ValidationError(
            "Enter a valid Mauritania phone number with 8 digits."
        )

    if len(set(digits)) == 1 or digits in {"12345678", "87654321", "00000000"}:
        raise serializers.ValidationError("Enter a real phone number.")

    return f"+222{digits}"


def normalize_national_id(value):
    digits = re.sub(r"\D", "", _compact(value))

    if len(digits) != 10:
        raise serializers.ValidationError(
            "Enter a valid Mauritania National ID number with exactly 10 digits."
        )

    if len(set(digits)) == 1 or digits in {"1234567890", "0987654321"}:
        raise serializers.ValidationError("Enter a real National ID number.")

    return digits


def validate_vehicle_value(value, label):
    value = _compact(value)

    if len(value) < 2 or value.casefold() in FAKE_VALUES or value.upper().startswith("TEMP"):
        raise serializers.ValidationError(f"Enter a real {label.lower()}.")

    return value


def validate_plate_number(value):
    value = _compact(value).upper()

    if (
        len(value) < 4
        or len(value) > 20
        or value.casefold() in FAKE_VALUES
        or value.startswith("TEMP")
        or not re.search(r"[A-Z]", value)
        or not re.search(r"\d", value)
    ):
        raise serializers.ValidationError("Enter a valid vehicle plate number.")

    return value
