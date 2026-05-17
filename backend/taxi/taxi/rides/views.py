from math import radians, cos, sin, asin, sqrt

from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view
from rest_framework.response import Response

from taxi.drivers.models import DriverProfile

from .models import Ride
from .serializers import RideSerializer


User = get_user_model()


def get_default_user(request):
    if request.user and request.user.is_authenticated:
        return request.user

    return User.objects.first()


def calculate_distance(lat1, lon1, lat2, lon2):
    lat1 = float(lat1)
    lon1 = float(lon1)
    lat2 = float(lat2)
    lon2 = float(lon2)

    earth_radius_km = 6371

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )

    c = 2 * asin(sqrt(a))

    return earth_radius_km * c


@api_view(["POST"])
def request_ride(request):
    rider = get_default_user(request)

    if not rider:
        return Response(
            {"error": "No user found. Create a user first."},
            status=400,
        )

    ride_type = request.data.get("ride_type", "regular")

    prices = {
        "regular": 200,
        "xl": 300,
        "comfort": 350,
        "share": 25,
    }

    estimated_price = request.data.get(
        "estimated_price",
        prices.get(ride_type, 200),
    )

    ride = Ride.objects.create(
        rider=rider,
        pickup_lat=request.data.get("pickup_lat"),
        pickup_lng=request.data.get("pickup_lng"),
        destination_lat=request.data.get("destination_lat"),
        destination_lng=request.data.get("destination_lng"),
        ride_type=ride_type,
        estimated_price=estimated_price,
        status="requested",
    )

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "ride": serializer.data,
    })


@api_view(["GET"])
def rides_list(request):
    rides = Ride.objects.all().order_by("-id")
    serializer = RideSerializer(rides, many=True)

    return Response(serializer.data)


@api_view(["GET"])
def ride_detail(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    serializer = RideSerializer(ride)

    return Response(serializer.data)


@api_view(["GET"])
def available_rides(request):
    driver = DriverProfile.objects.first()

    if not driver:
        return Response([])

    if not driver.is_available:
        return Response([])

    rides = Ride.objects.filter(
        status="requested",
    ).order_by("-id")

    nearby_rides = []

    for ride in rides:
        try:
            distance = calculate_distance(
                driver.current_lat,
                driver.current_lng,
                ride.pickup_lat,
                ride.pickup_lng,
            )

            if distance <= 10:
                nearby_rides.append(ride)

        except Exception:
            pass

    serializer = RideSerializer(nearby_rides, many=True)

    return Response(serializer.data)


@api_view(["GET"])
def rides_history(request):
    rides = Ride.objects.all().order_by("-id")
    serializer = RideSerializer(rides, many=True)

    return Response(serializer.data)


@api_view(["POST"])
def accept_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    driver_user = get_default_user(request)

    if not driver_user:
        return Response(
            {"error": "No driver user found"},
            status=400,
        )

    ride.driver = driver_user
    ride.status = "accepted"
    ride.save()

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "message": "Ride accepted successfully",
        "ride": serializer.data,
    })


@api_view(["POST"])
def driver_arriving(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    ride.status = "driver_arriving"
    ride.save()

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "message": "Driver is arriving",
        "ride": serializer.data,
    })


@api_view(["POST"])
def start_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    ride.status = "in_progress"
    ride.save()

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "message": "Ride started successfully",
        "ride": serializer.data,
    })


@api_view(["POST"])
def complete_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    ride.status = "completed"
    ride.save()

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "message": "Ride completed successfully",
        "ride": serializer.data,
    })


@api_view(["POST"])
def cancel_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found"},
            status=404,
        )

    ride.status = "cancelled"
    ride.save()

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "message": "Ride cancelled successfully",
        "ride": serializer.data,
    })