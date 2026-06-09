from rest_framework import serializers

from .models import City, CityPricing, Commune, Department, Locality, Region


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ["id", "name", "slug", "is_active"]


class DepartmentSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source="region.name", read_only=True)

    class Meta:
        model = Department
        fields = [
            "id",
            "region",
            "region_name",
            "name",
            "slug",
            "is_active",
            "service_enabled",
        ]


class CommuneSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    region_name = serializers.CharField(source="department.region.name", read_only=True)

    class Meta:
        model = Commune
        fields = [
            "id",
            "department",
            "department_name",
            "region_name",
            "name",
            "slug",
            "is_active",
            "service_enabled",
        ]


class LocalitySerializer(serializers.ModelSerializer):
    commune_name = serializers.CharField(source="commune.name", read_only=True)
    department_name = serializers.CharField(source="commune.department.name", read_only=True)
    region_name = serializers.CharField(source="commune.department.region.name", read_only=True)

    class Meta:
        model = Locality
        fields = [
            "id",
            "commune",
            "commune_name",
            "department_name",
            "region_name",
            "name",
            "slug",
            "is_active",
            "service_enabled",
            "latitude",
            "longitude",
        ]


class CityPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CityPricing
        fields = [
            "id",
            "city",
            "ride_type",
            "base_fare",
            "per_km",
            "minimum_fare",
            "is_active",
        ]


class CitySerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source="region.name", read_only=True)
    commune_name = serializers.CharField(source="commune.name", read_only=True)
    department_name = serializers.CharField(source="commune.department.name", read_only=True)
    pricing = CityPricingSerializer(many=True, read_only=True)

    class Meta:
        model = City
        fields = [
            "id",
            "region",
            "region_name",
            "commune",
            "commune_name",
            "department_name",
            "name",
            "slug",
            "is_active",
            "is_default",
            "latitude",
            "longitude",
            "pricing",
        ]
