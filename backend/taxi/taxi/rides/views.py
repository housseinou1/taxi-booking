from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Ride
from .serializers import RideSerializer


User = get_user_model()


def get_default_user(request):
    if request.user and request.user.is_authenticated:
        return request.user

    return User.objects.first()


@api_view(["POST"])
def request_ride(request):
    rider = get_default_user(request)

    if not rider:
        return Response({"error": "No user found. Create a user first."}, status=400)

    ride = Ride.objects.create(
        rider=rider,
        pickup_lat=request.data.get("pickup_lat"),
        pickup_lng=request.data.get("pickup_lng"),
        destination_lat=request.data.get("destination_lat"),
        destination_lng=request.data.get("destination_lng"),
        status="requested",
    )

    serializer = RideSerializer(ride)

    return Response({
        "success": True,
        "ride": serializer.data
    })


@api_view(["GET"])
def rides_list(request):
    rides = Ride.objects.all().order_by("-id")
    serializer = RideSerializer(rides, many=True)
    return Response(serializer.data)


@api_view(["GET"])
def available_rides(request):
    rides = Ride.objects.filter(status="requested").order_by("-id")
    serializer = RideSerializer(rides, many=True)
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

        driver = get_default_user(request)

        if not driver:
            return Response({"error": "No driver user found"}, status=400)

        ride.driver = driver
        ride.status = "accepted"
        ride.save()

        serializer = RideSerializer(ride)

        return Response({
            "success": True,
            "ride": serializer.data
        })

    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)


@api_view(["POST"])
def driver_arriving(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
        ride.status = "driver_arriving"
        ride.save()

        serializer = RideSerializer(ride)

        return Response({
            "success": True,
            "ride": serializer.data
        })

    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)


@api_view(["POST"])
def start_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
        ride.status = "in_progress"
        ride.save()

        serializer = RideSerializer(ride)

        return Response({
            "success": True,
            "ride": serializer.data
        })

    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)


@api_view(["POST"])
def complete_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
        ride.status = "completed"
        ride.save()

        serializer = RideSerializer(ride)

        return Response({
            "success": True,
            "ride": serializer.data
        })

    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)


@api_view(["POST"])
def cancel_ride(request, ride_id):
    try:
        ride = Ride.objects.get(id=ride_id)
        ride.status = "cancelled"
        ride.save()

        serializer = RideSerializer(ride)

        return Response({
            "success": True,
            "ride": serializer.data
        })

    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)