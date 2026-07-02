from django.db.models import Count, Sum
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import City, CityPricing, Commune, Department, Locality, Region
from .serializers import (
    CityPricingSerializer,
    CitySerializer,
    CommuneSerializer,
    DepartmentSerializer,
    LocalitySerializer,
    RegionSerializer,
)
from .services import city_analytics


class RegionListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(RegionSerializer(Region.objects.all(), many=True).data)

    def post(self, request):
        serializer = RegionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class DepartmentListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = Department.objects.select_related("region")
        region_id = request.query_params.get("region")
        if region_id:
            queryset = queryset.filter(region_id=region_id)
        return Response(DepartmentSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = DepartmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class DepartmentDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, department_id):
        department = Department.objects.get(id=department_id)
        serializer = DepartmentSerializer(department, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CommuneListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = Commune.objects.select_related("department", "department__region")
        department_id = request.query_params.get("department")
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        return Response(CommuneSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = CommuneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class CommuneDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, commune_id):
        commune = Commune.objects.get(id=commune_id)
        serializer = CommuneSerializer(commune, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LocalityListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = Locality.objects.select_related(
            "commune",
            "commune__department",
            "commune__department__region",
        )
        commune_id = request.query_params.get("commune")
        if commune_id:
            queryset = queryset.filter(commune_id=commune_id)
        return Response(LocalitySerializer(queryset, many=True).data)

    def post(self, request):
        serializer = LocalitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class LocalityDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, locality_id):
        locality = Locality.objects.get(id=locality_id)
        serializer = LocalitySerializer(locality, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CityListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        queryset = City.objects.select_related(
            "region",
            "commune",
            "commune__department",
        ).prefetch_related("pricing")
        if not request.user.is_authenticated or not request.user.is_staff:
            queryset = queryset.filter(is_active=True, region__is_active=True)
        return Response(CitySerializer(queryset, many=True).data)

    def post(self, request):
        serializer = CitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class CityDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, city_id):
        city = City.objects.get(id=city_id)
        serializer = CitySerializer(city, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CityPricingListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = CityPricing.objects.select_related("city", "city__region")
        city_id = request.query_params.get("city")
        if city_id:
            queryset = queryset.filter(city_id=city_id)
        return Response(CityPricingSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = CityPricingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class CityPricingDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pricing_id):
        pricing = CityPricing.objects.get(id=pricing_id)
        serializer = CityPricingSerializer(pricing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CityAnalyticsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        rows = []
        for city in City.objects.select_related("region").filter(is_active=True):
            rows.append({
                "city_id": city.id,
                "city": city.name,
                "region": city.region.name,
                **city_analytics(city),
            })

        return Response({
            "summary": city_analytics(),
            "cities": rows,
        })
