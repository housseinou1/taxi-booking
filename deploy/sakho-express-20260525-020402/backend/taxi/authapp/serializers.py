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
            "password",
            "user_type",
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "This email is already registered."
            )
        return value

    def create(self, validated_data):
        user_type = validated_data.pop("user_type")
        password = validated_data.pop("password")

        user = User(
            email=validated_data.get("email"),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            gender=validated_data.get("gender", ""),
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