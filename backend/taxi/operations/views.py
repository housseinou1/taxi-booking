from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import VehicleMaintenanceReminder
from .serializers import VehicleMaintenanceReminderSerializer


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def maintenance_reminders(request):
    if request.method == "GET":
        reminders = VehicleMaintenanceReminder.objects.filter(driver=request.user)
        return Response(VehicleMaintenanceReminderSerializer(reminders, many=True).data)
    serializer = VehicleMaintenanceReminderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(driver=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_maintenance(request, reminder_id):
    reminder = get_object_or_404(VehicleMaintenanceReminder, id=reminder_id, driver=request.user)
    reminder.mark_completed()
    return Response(VehicleMaintenanceReminderSerializer(reminder).data)

