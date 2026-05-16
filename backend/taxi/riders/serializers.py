from rest_framework import serializers
from .models import Rider

class RiderProfileSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Rider
        fields = "__all__"