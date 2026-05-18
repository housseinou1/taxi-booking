from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Ride


def ride_to_dict(ride):
    return {
        "id": ride.id,
        "pickup_lat": ride.pickup_lat,
        "pickup_lng": ride.pickup_lng,
        "destination_lat": ride.destination_lat,
        "destination_lng": ride.destination_lng,
        "ride_type": ride.ride_type,
        "estimated_price": ride.estimated_price,
        "status": ride.status,
    }


@api_view(["POST"])
def request_ride(request):
    ride = Ride.objects.create(
        rider=request.user if request.user.is_authenticated else None,
        pickup_lat=request.data.get("pickup_lat", 18.0735),
        pickup_lng=request.data.get("pickup_lng", -15.9582),
        destination_lat=request.data.get("destination_lat", 18.0896),
        destination_lng=request.data.get("destination_lng", -15.9754),
        ride_type=request.data.get("ride_type", "regular"),
        estimated_price=request.data.get("estimated_price", 200),
        status="requested",
    )

    return Response({"message": "Ride requested successfully", "ride": ride_to_dict(ride)})


@api_view(["GET"])
def rides_history(request):
    rides = Ride.objects.all().order_by("-id")
    return Response([ride_to_dict(ride) for ride in rides])


@api_view(["GET"])
def available_rides(request):
    rides = Ride.objects.filter(status="requested").order_by("-id")
    return Response([ride_to_dict(ride) for ride in rides])


@api_view(["GET"])
def ride_detail(request, id):
    try:
        ride = Ride.objects.get(id=id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    return Response(ride_to_dict(ride))


@api_view(["POST"])
def accept_ride(request, id):
    try:
        ride = Ride.objects.get(id=id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    ride.status = "accepted"
    ride.save()

    return Response({"message": "Ride accepted", "ride": ride_to_dict(ride)})


@api_view(["POST"])
def driver_arriving(request, id):
    try:
        ride = Ride.objects.get(id=id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    ride.status = "driver_arriving"
    ride.save()

    return Response({"message": "Driver arriving", "ride": ride_to_dict(ride)})


@api_view(["POST"])
def start_ride(request, id):
    try:
        ride = Ride.objects.get(id=id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    ride.status = "in_progress"
    ride.save()

    return Response({"message": "Ride started", "ride": ride_to_dict(ride)})


@api_view(["POST"])
def complete_ride(request, id):
    try:
        ride = Ride.objects.get(id=id)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found"}, status=404)

    ride.status = "completed"
    ride.save()

    return Response({"message": "Ride completed", "ride": ride_to_dict(ride)})