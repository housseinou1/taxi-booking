
from rest_framework import serializers
from riders.models import RiderProfile  
from riders.models import RiderProfile, SavedAddresses

class RiderProfileSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = RiderProfile
        fields = "__all__"
    def create(self, validated_data):
        get_request = self.context["request"]
        rider = RiderProfile(
            **validated_data
        )
        rider.user = get_request.user

        rider.save()

        return rider



class SavedAddressesSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedAddresses
        fields = [ "id", "address" ]
    
    def create(self, validated_data):
        get_request = self.context["request"]
        address = SavedAddresses(
            **validated_data
        )
        address.rider = get_request.user.rider_profile

        address.save()

        return address