from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from taxi.drivers.models import DriverProfile

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password]
    )
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    user_type = serializers.ChoiceField(
        choices=["rider", "driver"],
        write_only=True
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
            "password",
            "user_type",
            "profile_picture",
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "This email is already registered."
            )
        return value

    def validate(self, attrs):
        if attrs.get("user_type") == "rider":
            errors = {}

            if not attrs.get("profile_picture"):
                errors["profile_picture"] = "Rider profile photo is required."

            if not str(attrs.get("phone_number", "")).strip():
                errors["phone_number"] = "Rider phone number is required."

            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        user_type = validated_data.pop("user_type")
        password = validated_data.pop("password")
        profile_picture = validated_data.pop("profile_picture", None)

        user = User(
            email=validated_data.get("email"),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            gender=validated_data.get("gender", ""),
            phone_number=validated_data.get("phone_number", ""),
            user_type=user_type,
            rider_status="pending" if user_type == "rider" else "approved",
            profile_picture=profile_picture,
        )

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
