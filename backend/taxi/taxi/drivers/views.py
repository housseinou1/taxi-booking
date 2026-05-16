from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import DriverProfile
from .serializers import DriverProfileSerializer


@api_view(["GET"])
def driver_list(request):
    drivers = DriverProfile.objects.all()
    serializer = DriverProfileSerializer(drivers, many=True)
    return Response(serializer.data)


@api_view(["POST"])
def approve_driver(request, id):
    try:
        driver = DriverProfile.objects.get(id=id)
        driver.status = "approved"
        driver.save()
        return Response({"message": "Driver approved"})
    except DriverProfile.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)


@api_view(["POST"])
def reject_driver(request, id):
    try:
        driver = DriverProfile.objects.get(id=id)
        driver.status = "rejected"
        driver.save()
        return Response({"message": "Driver rejected"})
    except DriverProfile.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)


@api_view(["GET"])
def driver_status(request):
    driver = DriverProfile.objects.first()

    if not driver:
        return Response({
            "online": False,
            "is_online": False,
            "error": "No driver profile found"
        })

    return Response({
        "online": driver.is_available,
        "is_online": driver.is_available,
    })


@api_view(["POST"])
def update_driver_status(request):
    driver = DriverProfile.objects.first()

    if not driver:
        return Response({"error": "No driver profile found"}, status=404)

    online = request.data.get("online")

    if online is None:
        online = request.data.get("is_online", False)

    driver.is_available = bool(online)
    driver.save()

    return Response({
        "success": True,
        "online": driver.is_available,
        "is_online": driver.is_available,
    })


@api_view(["POST"])
def update_driver_location(request):
    driver = DriverProfile.objects.first()

    if not driver:
        return Response({"error": "No driver profile found"}, status=404)

    lat = request.data.get("lat")
    lng = request.data.get("lng")

    if lat is not None:
        driver.current_lat = lat
        driver.driver_lat = lat

    if lng is not None:
        driver.current_lng = lng
        driver.driver_lng = lng

    driver.save()

    return Response({
        "success": True,
        "lat": driver.current_lat,
        "lng": driver.current_lng,
    })


@api_view(["GET"])
def get_driver_location(request):
    driver = DriverProfile.objects.first()

    if not driver:
        return Response({"error": "No driver found"}, status=404)

    return Response({
        "lat": driver.current_lat,
        "lng": driver.current_lng,
        "driver_lat": driver.driver_lat,
        "driver_lng": driver.driver_lng,
        "is_online": driver.is_available,
        "online": driver.is_available,
    })