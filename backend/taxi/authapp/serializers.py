from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from taxi.drivers.models import DriverProfile
from cities.models import City
from .validators import (
    normalize_mauritania_phone,
    normalize_national_id,
    validate_person_name,
)

User = get_user_model()

MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024
MAX_ID_DOCUMENT_SIZE = 8 * 1024 * 1024
ALLOWED_PROFILE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_ID_DOCUMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def validate_uploaded_file(uploaded_file, *, allowed_types, max_size, label):
    if not uploaded_file:
        return uploaded_file

    content_type = getattr(uploaded_file, "content_type", "")
    if content_type and content_type not in allowed_types:
        allowed = ", ".join(sorted(allowed_types))
        raise serializers.ValidationError(
            f"{label} must be one of these file types: {allowed}."
        )

    if uploaded_file.size > max_size:
        size_mb = max_size // (1024 * 1024)
        raise serializers.ValidationError(f"{label} must be {size_mb}MB or smaller.")

    return uploaded_file


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password]
    )
    profile_picture = serializers.ImageField(required=False, allow_null=True)
    national_id_document = serializers.FileField(required=False, allow_null=True)

    user_type = serializers.ChoiceField(
        choices=["rider", "driver", "admin"],
        write_only=True
    )
    city = serializers.PrimaryKeyRelatedField(
        queryset=City.objects.filter(is_active=True),
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "first_name",
            "last_name",
            "email",
            "gender",
            "phone_number",
            "national_id_number",
            "national_id_document",
            "password",
            "user_type",
            "city",
            "profile_picture",
        ]

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "This email is already registered."
            )
        return value

    def validate_first_name(self, value):
        return validate_person_name(value, "First name")

    def validate_last_name(self, value):
        return validate_person_name(value, "Last name")

    def validate_phone_number(self, value):
        value = normalize_mauritania_phone(value)
        if User.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError(
                "This phone number is already registered."
            )
        return value

    def validate_national_id_number(self, value):
        value = normalize_national_id(value)
        if value and User.objects.filter(national_id_number__iexact=value).exists():
            raise serializers.ValidationError(
                "This National ID number is already used."
            )
        return value

    def validate_profile_picture(self, value):
        return validate_uploaded_file(
            value,
            allowed_types=ALLOWED_PROFILE_IMAGE_TYPES,
            max_size=MAX_PROFILE_IMAGE_SIZE,
            label="Profile photo",
        )

    def validate_national_id_document(self, value):
        return validate_uploaded_file(
            value,
            allowed_types=ALLOWED_ID_DOCUMENT_TYPES,
            max_size=MAX_ID_DOCUMENT_SIZE,
            label="National ID document",
        )

    def validate(self, attrs):
        errors = {}

        # --- App-type / user-type enforcement ---
        app_type = self.context.get("app_type")

        if not app_type:
            raise serializers.ValidationError(
                {"app_type": "X-App-Type header is required. Registration must identify the requesting app."}
            )

        user_type = attrs.get("user_type")

        if app_type in ("driver", "rider") and user_type != app_type:
            raise serializers.ValidationError(
                {"user_type": f"Registration from the {app_type} app must use user_type '{app_type}'."}
            )

        if user_type == "admin" and app_type != "web":
            raise serializers.ValidationError(
                {"user_type": "Admin accounts can only be created from the web app context."}
            )

        # --- Existing field-level validation ---
        if attrs.get("user_type") == "rider":
            if not attrs.get("profile_picture"):
                errors["profile_picture"] = "Rider profile photo is required."

            if not attrs.get("national_id_document"):
                errors["national_id_document"] = "National ID document is required."

        if not str(attrs.get("phone_number", "")).strip():
            errors["phone_number"] = "Phone number is required."

        if not str(attrs.get("national_id_number", "")).strip():
            errors["national_id_number"] = "National ID number is required."

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        user_type = validated_data.pop("user_type")
        password = validated_data.pop("password")
        city = validated_data.pop("city")
        profile_picture = validated_data.pop("profile_picture", None)
        national_id_document = validated_data.pop("national_id_document", None)

        user = User(
            email=validated_data.get("email"),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            gender=validated_data.get("gender", ""),
            phone_number=validated_data.get("phone_number", ""),
            national_id_number=validated_data.get("national_id_number", ""),
            national_id_document=national_id_document,
            city=city,
            user_type=user_type,
            rider_status="pending" if user_type == "rider" else "approved",
            profile_picture=profile_picture,
        )

        if user_type == "admin":
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True

        user.set_password(password)
        user.save()

        if user_type == "driver":
            DriverProfile.objects.get_or_create(
                user=user,
                defaults={
                    "plate_number": "TEMP-PLATE",
                    "vehicle_plate": "TEMP-PLATE",
                    "vehicle_make": "TEMP",
                    "vehicle_model": "TEMP",
                    "vehicle_color": "TEMP",
                    "phone_number": "",
                    "car_type": "regular",
                    "status": "pending",
                },
            )

        return user
