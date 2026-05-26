from django.shortcuts import get_object_or_404
from django.db.models import Sum
from django.utils.timezone import now

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from taxi.market import MARKET, calculate_app_fee, calculate_fare

from .models import Ride
from .serializers import RideSerializer


def calculate_money(ride):
    fare = ride.fare or 0
    app_fee = calculate_app_fee(fare)
    driver_earning = fare - app_fee

    ride.app_fee = app_fee
    ride.driver_earning = driver_earning
    ride.save()

    return ride


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_ride(request):
    distance_km = request.data.get("distance_km", request.data.get("distance", 0))
    ride_type = request.data.get("ride_type", "regular")
    fare = request.data.get("fare") or calculate_fare(ride_type, distance_km)

    ride = Ride.objects.create(
        rider=request.user,
        pickup=request.data.get("pickup", MARKET["default_pickup"]),
        destination=request.data.get("destination", MARKET["default_destination"]),
        pickup_lat=request.data.get("pickup_lat", MARKET["default_pickup_lat"]),
        pickup_lng=request.data.get("pickup_lng", MARKET["default_pickup_lng"]),
        destination_lat=request.data.get(
            "destination_lat",
            MARKET["default_destination_lat"],
        ),
        destination_lng=request.data.get(
            "destination_lng",
            MARKET["default_destination_lng"],
        ),
        distance_km=distance_km,
        ride_type=ride_type,
        fare=fare,
        status="requested",
    )

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def available_rides(request):
    rides = Ride.objects.filter(
        status="requested",
        driver__isnull=True,
    ).order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ride_history(request):
    if request.user.is_staff:
        rides = Ride.objects.all().order_by("-id")
    else:
        rides = Ride.objects.filter(
            rider=request.user,
        ).order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_rides(request):
    rides = Ride.objects.filter(
        driver=request.user,
    ).order_by("-id")

    serializer = RideSerializer(
        rides,
        many=True,
        context={"request": request},
    )

    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_ride(request, ride_id):
    ride = get_object_or_404(Ride, id=ride_id)

    if ride.driver is not None:
        return Response(
            {"detail": "Ride already accepted."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.driver = request.user
    ride.status = "driver_arriving"
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    ride.status = "in_progress"
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    ride.status = "completed"
    ride.save()

    calculate_money(ride)

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_ride(request, ride_id):
    ride = get_object_or_404(Ride, id=ride_id)

    if ride.status == "completed":
        return Response(
            {"detail": "Completed ride cannot be cancelled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.status = "cancelled"
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_ride(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        rider=request.user,
    )

    rating = request.data.get("rating")
    review = request.data.get("review", "")

    if not rating:
        return Response(
            {"detail": "Rating is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.rating = rating
    ride.review = review
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})

    return Response(
        {
            "message": "Rating submitted successfully",
            "ride": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_rider(request, ride_id):
    ride = get_object_or_404(
        Ride,
        id=ride_id,
        driver=request.user,
    )

    if ride.status != "completed":
        return Response(
            {"detail": "Only completed rides can be rated."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rating = request.data.get("rating")
    review = request.data.get("review", "")

    if not rating:
        return Response(
            {"detail": "Rating is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        rating_value = int(rating)
    except (TypeError, ValueError):
        return Response(
            {"detail": "Rating must be a number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if rating_value < 1 or rating_value > 5:
        return Response(
            {"detail": "Rating must be between 1 and 5."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.driver_rating = rating_value
    ride.driver_review = review
    ride.save()

    serializer = RideSerializer(ride, context={"request": request})

    return Response(
        {
            "message": "Rider rating submitted successfully",
            "ride": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_earnings_summary(request):
    driver = request.user

    completed_rides = Ride.objects.filter(
        driver=driver,
        status="completed",
    )

    today = now().date()

    today_rides = completed_rides.filter(
        created_at__date=today,
    )

    today_earnings = today_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    week_earnings = completed_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    total_earnings = completed_rides.aggregate(
        total=Sum("driver_earning")
    )["total"] or 0

    return Response(
        {
            "today_earnings": float(today_earnings),
            "week_earnings": float(week_earnings),
            "total_earnings": float(total_earnings),
            "completed_rides": completed_rides.count(),
        },
        status=status.HTTP_200_OK,
    )
